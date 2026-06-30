$port = 5050
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port"

while ($listener.IsListening) {
    $ctx  = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath.TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }

    $file = Join-Path $root $path

    if (Test-Path $file -PathType Leaf) {
        $ext  = [IO.Path]::GetExtension($file)
        $mime = switch ($ext) {
            '.html' { 'text/html; charset=utf-8' }
            '.css'  { 'text/css; charset=utf-8' }
            '.js'   { 'application/javascript; charset=utf-8' }
            '.png'  { 'image/png' }
            '.jpg'  { 'image/jpeg' }
            '.jpeg' { 'image/jpeg' }
            '.gif'  { 'image/gif' }
            '.svg'  { 'image/svg+xml' }
            '.ico'  { 'image/x-icon' }
            '.webp' { 'image/webp' }
            '.woff2'{ 'font/woff2' }
            '.woff' { 'font/woff' }
            default { 'application/octet-stream' }
        }
        $bytes = [IO.File]::ReadAllBytes($file)
        $ctx.Response.ContentType     = $mime
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.Headers.Add('Cache-Control', 'no-store, no-cache, must-revalidate')
        $ctx.Response.Headers.Add('Pragma', 'no-cache')
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $msg   = [Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $ctx.Response.StatusCode      = 404
        $ctx.Response.ContentLength64 = $msg.Length
        $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.OutputStream.Close()
}
