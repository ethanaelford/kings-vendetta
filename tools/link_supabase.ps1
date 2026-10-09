# Links this folder to the kings-vendetta Supabase project and pushes migrations (password from .env.local)
$line = Select-String -Path "$PSScriptRoot\..\.env.local" -Pattern 'SUPABASE_DB_PASSWORD=' | Select-Object -First 1
$pw = $line.Line.Split('=',2)[1]
Set-Location "$PSScriptRoot\.."
npx -y supabase link --project-ref xuejozfijzsqxezwjjid -p $pw
npx -y supabase db push -p $pw --include-all
