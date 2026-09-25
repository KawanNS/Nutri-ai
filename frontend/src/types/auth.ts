export interface AuthUser {
  id: string
  name: string
  email: string
  status: string
  role: 'USER' | 'ADMIN'
  createdAt: string
  updatedAt: string
}

export interface RegisterInput { name: string; email: string; password: string }
export interface RegisterResponse { user: AuthUser }
export interface LoginInput { email: string; password: string }
export interface LoginResponse { token: string; expiresIn: string; user: AuthUser }
export interface CurrentUserResponse { user: AuthUser }
