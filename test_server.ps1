$port = 8999
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
$listener.Start()

$run = $true
$job = [System.Threading.Tasks.Task]::Run([Action]{
    while ($run) {
        try {
            $client = $listener.AcceptTcpClient()
            $stream = $client.GetStream()
            $buf = New-Object byte[] 4096
            $read = $stream.Read($buf, 0, $buf.Length)
            if ($read -gt 0) {
                $reqStr = [System.Text.Encoding]::UTF8.GetString($buf, 0, $read)
                $firstLine = $reqStr.Split([char]10)[0].Trim()
                $path = $firstLine.Split(' ')[1].Split('?')[0]
                if ($path -eq '/') { $path = '/login.html' }
                $filePath = Join-Path $PSScriptRoot $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
                
                if (Test-Path $filePath -PathType Leaf) {
                    $bytes = [System.IO.File]::ReadAllBytes($filePath)
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $ct = 'text/html; charset=utf-8'
                    if ($ext -eq '.css') { $ct = 'text/css; charset=utf-8' }
                    if ($ext -eq '.js')  { $ct = 'text/javascript; charset=utf-8' }
                    if ($ext -eq '.png') { $ct = 'image/png' }
                    if ($ext -eq '.jpg') { $ct = 'image/jpeg' }
                    if ($ext -eq '.svg') { $ct = 'image/svg+xml' }

                    $header = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
                    $hBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                    $stream.Write($hBytes, 0, $hBytes.Length)
                    $stream.Write($bytes, 0, $bytes.Length)
                    $stream.Flush()
                } else {
                    $nf = "HTTP/1.1 404 Not Found`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
                    $nfBytes = [System.Text.Encoding]::UTF8.GetBytes($nf)
                    $stream.Write($nfBytes, 0, $nfBytes.Length)
                    $stream.Flush()
                }
            }
            $client.Close()
        } catch {}
    }
})

Start-Sleep -Milliseconds 300
$r1 = Invoke-WebRequest -Uri "http://localhost:$port/login.html" -UseBasicParsing
Write-Host "R1 Status:" $r1.StatusCode "Length:" $r1.RawContentLength
$r2 = Invoke-WebRequest -Uri "http://localhost:$port/css/style.css" -UseBasicParsing
Write-Host "R2 Status:" $r2.StatusCode "ContentType:" $r2.Headers['Content-Type']
$r3 = Invoke-WebRequest -Uri "http://localhost:$port/js/auth.js" -UseBasicParsing
Write-Host "R3 Status:" $r3.StatusCode "ContentType:" $r3.Headers['Content-Type']

$run = $false
$listener.Stop()
