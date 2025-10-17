"""
Debug settings for development with VS Code debugging
"""
import os
import sys
from .settings import *

# Override DEBUG settings for better debugging experience
DEBUG = True

# Enable detailed error pages
DEBUG_PROPAGATE_EXCEPTIONS = True

# Disable Django's exception handling in debug mode
# This allows VS Code debugger to catch exceptions
if 'debugpy' in sys.modules:
    # When debugpy is present, let exceptions bubble up to debugger
    DEBUG_PROPAGATE_EXCEPTIONS = True
    
    # Disable Django's internal exception handling
    import logging
    logging.basicConfig(level=logging.DEBUG)
    
    # Configure Django to not catch exceptions
    USE_TZ = True
    
    # Make sure we can see all SQL queries
    LOGGING = {
        'version': 1,
        'disable_existing_loggers': False,
        'handlers': {
            'console': {
                'class': 'logging.StreamHandler',
            },
        },
        'loggers': {
            'django.db.backends': {
                'level': 'DEBUG',
                'handlers': ['console'],
            },
            'django.request': {
                'level': 'DEBUG',
                'handlers': ['console'],
            },
        },
    }

# Add more detailed error information
if DEBUG:
    # Show more detailed error messages
    TEMPLATES[0]['OPTIONS']['debug'] = True
    
    # Enable SQL query logging
    LOGGING = {
        'version': 1,
        'disable_existing_loggers': False,
        'formatters': {
            'verbose': {
                'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
                'style': '{',
            },
        },
        'handlers': {
            'console': {
                'class': 'logging.StreamHandler',
                'formatter': 'verbose',
            },
        },
        'root': {
            'handlers': ['console'],
            'level': 'DEBUG',
        },
        'loggers': {
            'django': {
                'handlers': ['console'],
                'level': 'DEBUG',
                'propagate': False,
            },
            'django.db.backends': {
                'handlers': ['console'],
                'level': 'DEBUG',
                'propagate': False,
            },
            'django.request': {
                'handlers': ['console'],
                'level': 'DEBUG',
                'propagate': False,
            },
        },
    }
