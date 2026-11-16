// Production twin of the Vite dev proxy: /api/<path> → https://api.apiaberta.pt/<path>,
// adding the API key server-side. vercel.json rewrites /api/* here as ?path=<path>.
const UPSTREAM = 'https://api.apiaberta.pt/'

/** Forward an allowed v1 GET to API Aberta and stream the response back with CDN cache headers. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.searchParams.get('path') ?? ''
  url.searchParams.delete('path')

  // Only API Aberta's public v1 endpoints — not an open proxy.
  if (!/^v1\/[\w\-./%]*$/.test(path) || path.includes('..')) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const key = process.env.APIABERTA_KEY || process.env.VITE_APIABERTA_KEY
  const upstream = await fetch(UPSTREAM + path + url.search, {
    headers: key ? { 'X-API-Key': key } : {},
  })

  const headers = new Headers({
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
    // Share responses at the CDN for a minute so many visitors don't burn the rate limit.
    'cache-control': upstream.ok ? 'public, s-maxage=60, stale-while-revalidate=300' : 'no-store',
  })
  const reset = upstream.headers.get('x-ratelimit-reset')
  if (reset) headers.set('x-ratelimit-reset', reset) // the client's 429 retry reads this

  return new Response(upstream.body, { status: upstream.status, headers })
}
