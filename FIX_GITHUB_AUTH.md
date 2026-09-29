# Fix GitHub Authentication - Switch from m6 to m18

## Run these commands in PowerShell:

```powershell
# Clear Windows Credential Manager for GitHub (removes cached m6 credentials)
cmdkey /list | Select-String "github" | ForEach-Object { cmdkey /delete:($_ -replace ".*Target: ","" -replace " .*","") }

# Update git config to use marediasoftm18 globally
git config --global user.name "marediasoftm18"
git config --global user.email "marediasoftm18@gmail.com"

# Configure git to use credential helper
git config --global credential.helper manager-core

# Now push (will prompt for new credentials)
git push -u origin main
```

## When Prompted:
- **Username:** `marediasoftm18`
- **Password:** Your **Personal Access Token** (get from https://github.com/settings/tokens if needed)

## Alternative: Use Token in URL (Simpler)

If you have a Personal Access Token, use this instead:

```powershell
# Replace YOUR_TOKEN with your actual token
git remote set-url origin https://YOUR_TOKEN@github.com/marediasoftm18/melorimusicplatform.git
git push -u origin main
```

This embeds the token in the URL so no credential prompt appears.

**After successful push, remove the token from URL for security:**
```powershell
git remote set-url origin https://github.com/marediasoftm18/melorimusicplatform.git
```
