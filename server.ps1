# TelePulse - Zero-Admin Windows TcpListener Server

$port = 8000
$localIPObj = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1
$displayIP = if ($localIPObj) { $localIPObj.IPAddress } else { 'localhost' }

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)

try {
    $listener.Start()
} catch {
    $port = 8080
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
    $listener.Start()
}

Write-Host '===================================================' -ForegroundColor Green
Write-Host 'TelePulse Zero-Admin Server Ishga Tushdi!' -ForegroundColor Cyan
Write-Host '===================================================' -ForegroundColor Green
Write-Host "Kompyuterda:            http://localhost:${port}/login.html" -ForegroundColor Yellow
Write-Host "Wi-Fi dagi telefonlar:  http://${displayIP}:${port}/login.html" -ForegroundColor Magenta
Write-Host '===================================================' -ForegroundColor Green

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.json' = 'application/json'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.webp' = 'image/webp'
    '.webm' = 'video/webm'
    '.mp4'  = 'video/mp4'
}

$rn = [char]13 + [char]10

while ($true) {
    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $requestLine = $reader.ReadLine()

        if ($requestLine) {
            $parts = $requestLine.Split(' ')
            $url = if ($parts.Length -gt 1) { $parts[1] } else { '/' }
            if ($url -eq '/') { $url = '/login.html' }
            $cleanUrl = $url.Split('?')[0]

            if ($cleanUrl -eq '/api/server-info' -or $cleanUrl -eq '/api/ip') {
                $jsonResponse = '{"ip":"' + $displayIP + '","port":' + $port + ',"url":"http://' + $displayIP + ':' + $port + '/login.html"}'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $header = 'HTTP/1.1 200 OK' + $rn + 'Content-Type: application/json; charset=utf-8' + $rn + 'Content-Length: ' + $bytes.Length + $rn + 'Access-Control-Allow-Origin: *' + $rn + 'Connection: close' + $rn + $rn
                $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                $stream.Write($bytes, 0, $bytes.Length)
            } elseif (Test-Path $localPath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
                $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { 'application/octet-stream' }
                $bytes = [System.IO.File]::ReadAllBytes($localPath)

                $header = 'HTTP/1.1 200 OK' + $rn + 'Content-Type: ' + $contentType + $rn + 'Content-Length: ' + $bytes.Length + $rn + 'Access-Control-Allow-Origin: *' + $rn + 'Connection: close' + $rn + $rn
                $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                $stream.Write($bytes, 0, $bytes.Length)
            } else {
                $notFound = 'HTTP/1.1 404 Not Found' + $rn + 'Connection: close' + $rn + $rn
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($notFound)
                $stream.Write($bytes, 0, $bytes.Length)
            }
        }
        $client.Close()
    } catch {
    }
}
