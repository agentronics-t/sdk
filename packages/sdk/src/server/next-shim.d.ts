// Minimal typing for the optional `next` peer so the SDK builds without it.
declare module 'next/server' {
  export const NextResponse: {
    next(init?: { request?: { headers?: Headers } }): Response
  }
}
