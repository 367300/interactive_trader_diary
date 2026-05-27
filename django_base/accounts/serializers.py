from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import TraderProfile


class UserSerializer(serializers.ModelSerializer):
    """Базовое представление пользователя для клиента."""

    is_staff = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'is_staff')
        read_only_fields = ('id', 'is_staff')


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('Пользователь с таким именем уже существует')
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Пользователь с таким email уже существует')
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
        )
        TraderProfile.objects.get_or_create(user=user)
        return user


class LoginSerializer(serializers.Serializer):
    """Вход по username или email."""

    login = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        login = attrs['login'].strip()
        password = attrs['password']
        user = authenticate(username=login, password=password)
        if user is None and '@' in login:
            try:
                candidate = User.objects.get(email__iexact=login)
            except User.DoesNotExist:
                candidate = None
            if candidate is not None:
                user = authenticate(username=candidate.username, password=password)
        if user is None or not user.is_active:
            raise serializers.ValidationError('Неверный логин или пароль')
        attrs['user'] = user
        return attrs


def issue_tokens_for(user):
    """Генерация пары токенов + сериализованный пользователь."""
    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserSerializer(user).data,
    }


class TraderProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    tinkoff_token = serializers.CharField(
        write_only=True, required=False, allow_blank=True
    )
    tinkoff_token_masked = serializers.CharField(read_only=True)
    has_tinkoff_token = serializers.BooleanField(read_only=True)

    class Meta:
        model = TraderProfile
        fields = (
            'user', 'created_at', 'updated_at',
            'tinkoff_token', 'tinkoff_token_masked', 'has_tinkoff_token',
        )
        read_only_fields = ('created_at', 'updated_at')

    def update(self, instance, validated_data):
        token = validated_data.pop('tinkoff_token', None)
        if token is not None:
            instance.tinkoff_token = token
        return super().update(instance, validated_data)
