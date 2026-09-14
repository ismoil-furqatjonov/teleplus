$listener = New-Object System.Net.HttpListener
try {
    $listener.Prefixes.Add('http://*:8080/')
    $listener.Start()
    Write-Host 'SUCCESS: Wildcard * worked!'
    $listener.Stop()
} catch {
    Write-Host 'FAILED wildcard:' $_.Exception.Message
}
