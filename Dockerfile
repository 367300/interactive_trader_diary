# For more information, please refer to https://aka.ms/vscode-docker-python
FROM python:3.12-slim

EXPOSE 8000

# Keeps Python from generating .pyc files in the container
ENV PYTHONDONTWRITEBYTECODE=1

# Turns off buffering for easier container logging
ENV PYTHONUNBUFFERED=1

# Install system dependencies for PostgreSQL and build tools
RUN apt-get update && apt-get install -y \
    postgresql-client \
    libpq-dev \
    gcc \
    make \
    build-essential \
    libffi-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pip requirements
COPY requirements.txt .
RUN python -m pip install -r requirements.txt

# tinkoff-investments карантинирован на PyPI вместе с подзависимостью `tinkoff`,
# поэтому ставим напрямую из GitHub без подтягивания зависимостей.
RUN python -m pip install --no-deps git+https://github.com/Tinkoff/invest-python.git

# Install debugpy for debugging support
RUN python -m pip install debugpy

WORKDIR /app
COPY . /app

# Creates a non-root user with an explicit UID and adds permission to access the /app folder
# For more info, please refer to https://aka.ms/vscode-docker-python-configure-containers
RUN adduser -u 5678 --disabled-password --gecos "" appuser \
    && mkdir -p /app/django_base/static /app/uploads/data_instruments \
    && chown -R appuser:appuser /app
USER appuser

# During debugging, this entry point will be overridden. For more information, please refer to https://aka.ms/vscode-docker-python-debug
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "django_base.wsgi"]
