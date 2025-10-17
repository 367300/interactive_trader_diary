import os
import sqlite3
from decouple import config
from pathlib import Path
from typing import List
from tqdm import tqdm
from rich import print
import ast
import tiktoken
from git import Repo
from openai import OpenAI
import json
import hashlib
from fnmatch import fnmatch

# === Чтение ключа OpenAI из .env ===
OPENAI_API_KEY = config('OPENAI_API_KEY')

client = OpenAI(api_key=OPENAI_API_KEY)

# === НАСТРОЙКИ ===
# Корневая директория для поиска файлов
ROOT_DIR = Path('.')
# Расширения файлов для обработки
FILE_EXTENSIONS = ['.py', '.md', '.yml' , '.conf']
# Имя файла базы данных
DB_PATH = 'embeddings.sqlite3'
# Количество последних коммитов
N_COMMITS = 3
# Лимит токенов на блок
TOKEN_LIMIT = 1600

# === Инициализация базы данных ===
def init_db(db_path: str):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            embedding TEXT,
            file_path TEXT,
            block_type TEXT,
            class_name TEXT,
            method_name TEXT,
            start_line INTEGER,
            end_line INTEGER,
            commit_messages TEXT,
            raw_text TEXT,
            embedding_text TEXT
        )
    ''')
    conn.commit()
    return conn

# === Чтение .gitignore ===
def load_gitignore(root_dir: Path) -> List[str]:
    """Загрузить правила из .gitignore."""
    gitignore_path = root_dir / '.gitignore'
    if not gitignore_path.exists():
        return []
    
    with open(gitignore_path, 'r', encoding='utf-8') as f:
        return [line.strip() for line in f if line.strip() and not line.startswith('#')]

def should_ignore_file(file_path: Path, gitignore_patterns: List[str]) -> bool:
    """Проверить, должен ли файл быть проигнорирован."""
    rel_path = str(file_path.relative_to(ROOT_DIR))
    
    for pattern in gitignore_patterns:
        # Убираем слеш в начале, если есть
        if pattern.startswith('/'):
            pattern = pattern[1:]
        
        # Проверяем точное совпадение
        if fnmatch(rel_path, pattern):
            return True
        
        # Проверяем, находится ли файл внутри директории
        # Для паттернов с / в конце (например, "static/")
        if pattern.endswith('/'):
            dir_pattern = pattern[:-1]  # убираем trailing slash
            # Разбиваем путь на части и проверяем каждую директорию
            path_parts = rel_path.split('/')
            if dir_pattern in path_parts:
                return True
        
        # Для паттернов без / в конце, но которые могут быть директориями
        else:
            # Проверяем, начинается ли путь с этой директории
            if rel_path.startswith(pattern + '/'):
                return True
            
            # Проверяем точное совпадение с файлом
            if rel_path == pattern:
                return True
            
            # Проверяем, является ли паттерн директорией в пути
            path_parts = rel_path.split('/')
            if pattern in path_parts:
                return True
    
    return False

# === Проверка изменений файлов ===
def get_file_hash(file_path: Path) -> str:
    """Получить хеш файла для отслеживания изменений."""
    with open(file_path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()

def get_existing_file_hashes(conn) -> dict:
    """Получить хеши уже обработанных файлов из БД."""
    c = conn.cursor()
    try:
        c.execute('''
            SELECT file_path, file_hash FROM file_hashes
        ''')
        return dict(c.fetchall())
    except sqlite3.OperationalError:
        # Если таблица не существует, создаём её
        c.execute('''
            CREATE TABLE IF NOT EXISTS file_hashes (
                file_path TEXT PRIMARY KEY,
                file_hash TEXT
            )
        ''')
        conn.commit()
        return {}

def update_file_hash(conn, file_path: str, file_hash: str):
    """Обновить хеш файла в БД."""
    c = conn.cursor()
    c.execute('''
        INSERT OR REPLACE INTO file_hashes (file_path, file_hash)
        VALUES (?, ?)
    ''', (file_path, file_hash))
    conn.commit()

def delete_file_blocks(conn, file_path: str):
    """Удалить все блоки для файла из БД."""
    c = conn.cursor()
    c.execute('DELETE FROM embeddings WHERE file_path = ?', (file_path,))
    conn.commit()

def get_existing_blocks_for_file(conn, file_path: str) -> list:
    """Получить все существующие блоки для файла."""
    c = conn.cursor()
    c.execute('''
        SELECT id, class_name, method_name, start_line, end_line, block_type
        FROM embeddings WHERE file_path = ?
    ''', (file_path,))
    return c.fetchall()

def block_exists(conn, file_path: str, class_name: str, method_name: str, start_line: int, end_line: int, block_type: str) -> bool:
    """Проверить, существует ли блок с такими параметрами."""
    c = conn.cursor()
    c.execute('''
        SELECT COUNT(*) FROM embeddings
        WHERE file_path = ? AND class_name = ? AND method_name = ? 
        AND start_line = ? AND end_line = ? AND block_type = ?
    ''', (file_path, class_name, method_name, start_line, end_line, block_type))
    return c.fetchone()[0] > 0

# === Поиск файлов ===
def find_files(root_dir: Path, extensions: List[str], gitignore_patterns: List[str]) -> List[Path]:
    files = []
    for ext in extensions:
        for file_path in root_dir.rglob(f'*{ext}'):
            if not should_ignore_file(file_path, gitignore_patterns):
                files.append(file_path)
    return files

# === Структура блока ===
class CodeBlock:
    def __init__(self, file_path, block_type, class_name, method_name, start_line, end_line, raw_text):
        self.file_path = str(file_path)
        self.block_type = block_type
        self.class_name = class_name
        self.method_name = method_name
        self.start_line = start_line
        self.end_line = end_line
        self.raw_text = raw_text
        self.commit_messages = None  # будет добавлено позже

    def __repr__(self):
        return f"<Block {self.block_type} {self.class_name or ''} {self.method_name or ''} {self.file_path}:{self.start_line}-{self.end_line}>"

# === Подсчёт токенов ===
def count_tokens(text: str) -> int:
    enc = tiktoken.get_encoding('cl100k_base')
    return len(enc.encode(text))

# === Парсинг .py файлов ===
def parse_python_file(file_path: Path) -> list:
    with open(file_path, 'r', encoding='utf-8') as f:
        source = f.read()
    tree = ast.parse(source)
    blocks = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            class_name = node.name
            for item in node.body:
                if isinstance(item, ast.FunctionDef):
                    start = item.lineno
                    end = getattr(item, 'end_lineno', start)
                    method_text = ast.get_source_segment(source, item)
                    # Добавляем комментарий о классе
                    block_text = f"# class: {class_name}\n{method_text}"
                    blocks.append(CodeBlock(
                        file_path=file_path,
                        block_type='method',
                        class_name=class_name,
                        method_name=item.name,
                        start_line=start,
                        end_line=end,
                        raw_text=block_text
                    ))
        elif isinstance(node, ast.FunctionDef) and not hasattr(node, 'parent_class'):
            # Функция вне класса
            start = node.lineno
            end = getattr(node, 'end_lineno', start)
            func_text = ast.get_source_segment(source, node)
            blocks.append(CodeBlock(
                file_path=file_path,
                block_type='function',
                class_name=None,
                method_name=node.name,
                start_line=start,
                end_line=end,
                raw_text=func_text
            ))
    return blocks

# === Разбивка .md и .yml файлов на блоки по токенам ===
def split_text_file(file_path: Path, token_limit: int = TOKEN_LIMIT) -> list:
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    blocks = []
    current_block = []
    current_tokens = 0
    start_line = 1
    for idx, line in enumerate(lines, 1):
        line_tokens = count_tokens(line)
        if current_tokens + line_tokens > token_limit and current_block:
            block_text = ''.join(current_block)
            blocks.append(CodeBlock(
                file_path=file_path,
                block_type=file_path.suffix[1:],
                class_name=None,
                method_name=None,
                start_line=start_line,
                end_line=idx-1,
                raw_text=block_text
            ))
            current_block = []
            current_tokens = 0
            start_line = idx
        current_block.append(line)
        current_tokens += line_tokens
    if current_block:
        block_text = ''.join(current_block)
        blocks.append(CodeBlock(
            file_path=file_path,
            block_type=file_path.suffix[1:],
            class_name=None,
            method_name=None,
            start_line=start_line,
            end_line=len(lines),
            raw_text=block_text
        ))
    return blocks

def get_last_commit_messages(file_path: Path, n: int = N_COMMITS) -> list:
    """Получить n последних сообщений коммитов для файла."""
    try:
        repo = Repo(search_parent_directories=True)
        abs_file_path = file_path.resolve()
        repo_root = Path(repo.working_tree_dir).resolve()
        rel_path = abs_file_path.relative_to(repo_root)
        commits = list(repo.iter_commits(paths=str(rel_path), max_count=n))
        return [c.message.strip() for c in commits]
    except Exception as e:
        print(f'[yellow]Не удалось получить коммиты для {file_path}: {e}[/yellow]')
        return []

# === Основная обработка файлов ===
def process_files(files: list) -> list:
    all_blocks = []
    for file_path in tqdm(files, desc='Обработка файлов'):
        ext = file_path.suffix
        if ext == '.py':
            blocks = parse_python_file(file_path)
        elif ext in ['.md', '.yml']:
            blocks = split_text_file(file_path)
        else:
            continue
        commit_msgs = get_last_commit_messages(file_path)
        for block in blocks:
            block.commit_messages = commit_msgs
        all_blocks.extend(blocks)
    return all_blocks

# === Инициализация OpenAI ===

def get_embedding(text: str) -> list:
    """Получить эмбединг для текста через OpenAI API."""
    try:
        response = client.embeddings.create(input=text,
        model="text-embedding-ada-002")
        return response.data[0].embedding
    except Exception as e:
        print(f'[red]Ошибка получения эмбединга: {e}[/red]')
        return None

def save_embedding(conn, block: CodeBlock, embedding: list, embedding_text: str):
    """Сохранить эмбединг в базу данных."""
    c = conn.cursor()
    c.execute('''
        INSERT INTO embeddings 
        (embedding, file_path, block_type, class_name, method_name, 
         start_line, end_line, commit_messages, raw_text, embedding_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        json.dumps(embedding),
        block.file_path,
        block.block_type,
        block.class_name,
        block.method_name,
        block.start_line,
        block.end_line,
        json.dumps(block.commit_messages) if block.commit_messages else None,
        block.raw_text,
        embedding_text
    ))
    conn.commit()

def process_embeddings(conn, blocks: list):
    """Обработать все блоки и сохранить эмбединги."""
    for block in tqdm(blocks, desc='Генерация эмбедингов'):
        # Проверяем, существует ли уже такой блок
        if block_exists(conn, block.file_path, block.class_name, block.method_name, 
                       block.start_line, block.end_line, block.block_type):
            continue  # Пропускаем существующий блок
        
        # Формируем текст для эмбединга
        embedding_text = f"File: {block.file_path}\n"
        if block.class_name:
            embedding_text += f"Class: {block.class_name}\n"
        if block.method_name:
            embedding_text += f"Method/Function: {block.method_name}\n"
        embedding_text += f"Lines: {block.start_line}-{block.end_line}\n"
        if block.commit_messages:
            embedding_text += f"Recent commits: {'; '.join(block.commit_messages)}\n"
        embedding_text += f"\nCode:\n{block.raw_text}"

        # Получаем эмбединг
        embedding = get_embedding(embedding_text)
        if embedding:
            save_embedding(conn, block, embedding, embedding_text)
        else:
            print(f'[yellow]Пропущен блок: {block}[/yellow]')

if __name__ == '__main__':
    print(f'[bold green]Инициализация базы данных...[/bold green]')
    conn = init_db(DB_PATH)
    
    print(f'[bold green]Загрузка .gitignore...[/bold green]')
    gitignore_patterns = load_gitignore(ROOT_DIR)
    print(f'[bold blue]Загружено правил .gitignore:[/bold blue] {len(gitignore_patterns)}')
    
    print(f'[bold green]Поиск файлов...[/bold green]')
    files = find_files(ROOT_DIR, FILE_EXTENSIONS, gitignore_patterns)
    print(f'[bold blue]Найдено файлов:[/bold blue] {len(files)}')
    
    # Проверяем изменения файлов
    existing_hashes = get_existing_file_hashes(conn)
    files_to_process = []
    
    for file_path in files:
        file_hash = get_file_hash(file_path)
        if str(file_path) not in existing_hashes or existing_hashes[str(file_path)] != file_hash:
            files_to_process.append(file_path)
            # Удаляем старые блоки для изменённого файла
            if str(file_path) in existing_hashes:
                delete_file_blocks(conn, str(file_path))
            # Обновляем хеш
            update_file_hash(conn, str(file_path), file_hash)
    
    print(f'[bold blue]Файлов для обработки:[/bold blue] {len(files_to_process)}')
    if files_to_process:
        for f in files_to_process:
            print(f'- {f}')
    
    if files_to_process:
        print(f'[bold green]Обработка файлов...[/bold green]')
        all_blocks = process_files(files_to_process)
        print(f'[bold magenta]Всего блоков для эмбединга:[/bold magenta] {len(all_blocks)}')
        
        print(f'[bold green]Генерация эмбедингов...[/bold green]')
        process_embeddings(conn, all_blocks)
    else:
        print(f'[bold green]Все файлы актуальны, обновление не требуется![/bold green]')
    
    print(f'[bold green]Готово! Эмбединги сохранены в {DB_PATH}[/bold green]')
    conn.close()