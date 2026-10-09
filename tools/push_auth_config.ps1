# Pushes supabase/config.toml auth settings (Google sign-in) using keys from .env.local
Set-Location "$PSScriptRoot\.."
foreach ($line in Get-Content .env.local) {
  if ($line -match '^\s*([A-Z_]+)=(.*)$') { Set-Item -Path ("env:" + $matches[1]) -Value $matches[2].Trim() }
}
if (-not $env:GOOGLE_CLIENT_ID -or -not $env:GOOGLE_CLIENT_SECRET) { Write-Host "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first"; exit 1 }
'y' | npx -y supabase config push --project-ref xuejozfijzsqxezwjjid
