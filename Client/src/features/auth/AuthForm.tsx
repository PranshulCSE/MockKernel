import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react'
import { AuthError } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'
import { GoogleButton } from '../../components/auth/GoogleButton'
import { Background } from '../../components/layout/Background'
import { Logo } from '../../components/layout/Logo'
import { Button, GlassCard, Input } from '../../components/ui'

type Mode = 'login' | 'signup'

interface FieldErrors {
  name?: string
  email?: string
  password?: string
}

const copy = {
  login: {
    title: 'Welcome back',
    sub: 'Log in to continue where you left off.',
    submit: 'Log in',
    google: 'Continue with Google',
    switchText: 'New to MockKernel?',
    switchLink: 'Create an account',
    switchTo: '/signup',
  },
  signup: {
    title: 'Create your account',
    sub: 'Start solving problems and practicing interviews.',
    submit: 'Create account',
    google: 'Sign up with Google',
    switchText: 'Already have an account?',
    switchLink: 'Log in',
    switchTo: '/login',
  },
} as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(mode: Mode, name: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {}
  if (mode === 'signup' && name.trim().length < 2) errors.name = 'Enter your name.'
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.'
  if (mode === 'signup' && password.length < 8) errors.password = 'Use at least 8 characters.'
  if (mode === 'login' && password.length === 0) errors.password = 'Enter your password.'
  return errors
}

export function AuthForm({ mode }: { mode: Mode }) {
  const t = copy[mode]
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  const { login, register, loginWithGoogle } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'form' | 'google' | null>(null)

  async function run(kind: 'form' | 'google', action: () => Promise<void>) {
    setBusy(kind)
    setFormError(null)
    try {
      await action()
      navigate(from, { replace: true })
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : 'Something went wrong. Try again.')
      setBusy(null)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const found = validate(mode, name, email, password)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    void run('form', () =>
      mode === 'login' ? login({ email, password }) : register({ name, email, password }),
    )
  }

  return (
    <>
      <Background />
      <div className="grid min-h-screen place-items-center px-6 py-12">
        <div className="flex w-full max-w-md flex-col items-center gap-8">
          <Link to="/" aria-label="MockKernel home">
            <Logo />
          </Link>

          <GlassCard strong className="w-full p-8">
            <h1 className="text-2xl font-bold">{t.title}</h1>
            <p className="mt-1 text-sm text-muted">{t.sub}</p>

            <div className="mt-6">
              <GoogleButton
                label={t.google}
                loading={busy === 'google'}
                onToken={(token) => void run('google', () => loginWithGoogle(token))}
                onError={() => setFormError('Google sign-in failed. Try again or use email.')}
              />
            </div>

            <div className="my-6 flex items-center gap-3 text-xs text-muted" role="separator">
              <span className="h-px flex-1 bg-white/10" />
              or use email
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              {formError && (
                <p role="alert" className="rounded-ctl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
                  {formError}
                </p>
              )}
              {mode === 'signup' && (
                <Input
                  label="Name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={errors.name}
                  leftIcon={<User className="size-4" />}
                />
              )}
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
                leftIcon={<Mail className="size-4" />}
              />
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
                leftIcon={<Lock className="size-4" />}
                rightSlot={
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="grid size-8 place-items-center rounded-full text-muted hover:text-ink"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                }
              />
              <Button type="submit" size="lg" className="mt-2 w-full" loading={busy === 'form'}>
                {t.submit}
              </Button>
            </form>
          </GlassCard>

          <p className="text-sm text-muted">
            {t.switchText}{' '}
            <Link to={t.switchTo} className="font-semibold text-cyan hover:underline">
              {t.switchLink}
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
