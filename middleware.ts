import { auth } from '@/lib/auth'

export default auth((req) => {
  const isAuthed = !!req.auth
  const onAuthPage = ['/login', '/register', '/forgot-password'].some((p) =>
    req.nextUrl.pathname.startsWith(p))
  if (!isAuthed && !onAuthPage) {
    return Response.redirect(new URL('/login', req.nextUrl))
  }
  if (isAuthed && onAuthPage) {
    return Response.redirect(new URL('/', req.nextUrl))
  }
})

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] }
