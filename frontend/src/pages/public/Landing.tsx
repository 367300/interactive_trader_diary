import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <section>
      <h1 style={{ fontSize: 36, marginBottom: 18 }}>
        Ваш торговый дневник в одном окне
      </h1>
      <p style={{ fontSize: 17, maxWidth: 720, marginBottom: 26 }}>
        Записывайте сделки, добавляйте основания и выводы, прикладывайте скриншоты, считайте
        результаты в пипсах. Простая структура, тёмная тема и быстрый поиск инструментов.
      </p>
      <div className="row-flex">
        <Link to="/register" className="btn btn-primary">Создать аккаунт</Link>
        <Link to="/login" className="btn">У меня уже есть аккаунт</Link>
      </div>

      <div className="grid grid-3" style={{ marginTop: 40 }}>
        <div className="card">
          <h3>Сделки и анализ</h3>
          <p>Заносите вход, усреднения, частичные и полные закрытия — рассчитываем пипсы автоматически.</p>
        </div>
        <div className="card">
          <h3>Свои стратегии</h3>
          <p>Группируйте сделки по стратегиям и смотрите, какие из них реально работают.</p>
        </div>
        <div className="card">
          <h3>Инструменты ММВБ</h3>
          <p>Справочник акций и фьючерсов с поиском, фильтрами и таксономией секторов.</p>
        </div>
      </div>
    </section>
  );
}
