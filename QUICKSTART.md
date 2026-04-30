# 🚀 Quick Start Guide

## Installation & Lancement (30 secondes)

### Windows
```bash
# 1. Téléchargez le projet
# 2. Extraire le dossier
# 3. Double-cliquez sur "start.bat"
# ✅ C'est tout! La GUI s'ouvre à http://localhost:3000
```

### Linux/Mac
```bash
cd discord-autotool
npm install
npm start
```

## Première Configuration

### 1️⃣ Ajouter vos Tokens
```
🔑 Tokens → ➕ Ajouter un Token
├─ Token Discord (copié depuis Developer Mode)
├─ Nom (optionnel): "Mon Token"
└─ Groupe: "default"
```

### 2️⃣ Configurer AutoBump
```
🚀 AutoBump → ➕ Ajouter un Serveur
├─ ID Serveur: (copier depuis URL Discord)
├─ ID Salon Bump: (salon où /bump fonctionne)
├─ Token: (sélectionner le token)
└─ Démarrer ▶️
```

### 3️⃣ Configurer AutoSender  
```
💬 AutoSender → ➕ Ajouter un Message
├─ Contenu: "Mon message"
├─ Tokens: (sélectionner)
├─ Salons: (copier IDs)
└─ Démarrer ▶️
```

## Trouver les IDs Discord

### 1. Activer Developer Mode
- Discord → Paramètres Utilisateur → App Settings → Advanced → Developer Mode

### 2. Copier les IDs
- **ID Serveur**: Clic droit serveur → "Copier l'ID du serveur"
- **ID Salon**: Clic droit salon → "Copier l'ID du canal"

### 3. ID Utilisateur / Bot
- Clic droit sur un utilisateur → "Copier l'ID utilisateur"

## Où trouver mon Token?

⚠️ **ATTENTION - NE PARTAGEZ JAMAIS VOTRE TOKEN!**

1. Ouvrez Discord
2. Appuyez sur `F12` (DevTools)
3. Allez dans `Application` → `Local Storage` → `https://discord.com`
4. Cherchez `token` dans la colonne "Value"
5. Copiez la valeur (entre guillemets)

**Alternative cli:**
```bash
# Lisez les logs Discord depuis DevTools Console:
(function() {
  const token = localStorage.getItem('token');
  console.log(token);
})();
```

## Configuration Webhooks (Optional)

Pour recevoir les logs Discord:

1. Créez un webhook dans un serveur Discord:
   - Serveur → Paramètres → Intégrations → Webhooks
   - Nouveau Webhook → Copier URL

2. Dans AutoTool:
   - 🪝 Webhooks → Coller URL
   - Activer "Logger les erreurs" / "Logger les succès"

## Modes d'Utilisation

### GUI (Facile)
```
✅ Interface graphique
✅ Configuration visuelle  
✅ Gestion facile
→ http://localhost:3000
```

### CLI (Terminal)
```
⌨️  Interface textuelle
⌨️  Choix 1/2
⌨️  Parfait pour serveurs
→ Lancer: npm start → Sélectionner CLI
```

## Paramètres AutoBump

| Paramètre | Description |
|-----------|-------------|
| **Humanize** | Ajoute 1-15 min aléatoires entre bumps |
| **Min/Max** | Temps min/max pour humanization |
| **Max serveurs/token** | Warning si dépassé (recommandé: 4) |

## Paramètres AutoSender

| Paramètre | Description |
|-----------|-------------|
| **Tokens globaux** | Utiliser tous les tokens pour ce message |
| **Salons globaux** | Utiliser tous les salons configurés |
| **Délai personnalisé** | ms entre envois (défaut: 3500) |

## Variables de Message

Utilisez ces variables dans vos messages:
- `{date}` → Affiche la date du jour
- `{time}` → Affiche l'heure
- `{timestamp}` → Timestamp complet
- `{random}` → Code aléatoire

## Dépannage

| Problème | Solution |
|----------|----------|
| "Token invalide" | Vérifiez que vous avez bien copié le token |
| "Salon non trouvé" | L'ID salon est faux ou salon supprimé |
| "Permissions insuffisantes" | Vérifiez les permissions du salon |
| "Rate limited" | Normal, l'outil attend 5min et retry |
| "GUI ne démarre pas" | Vérifiez que port 3000 est libre |

## Fichiers Importants

```
📁 config/
├─ tokens.json          ← Vos tokens
├─ bump-config.json     ← Config bump
├─ sender-config.json   ← Config sender
├─ groups.json          ← Groupes
└─ webhooks.json        ← Webhooks
```

⚠️ **Protégez ces fichiers!** (Ne les partagez jamais)

## Logs & Monitoring

### Console
```
✅ Successs → Bump effectué!
❌ Erreurs → Permission denied
⚠️  Avertissements → Slowmode détecté
```

### Webhook Discord
Les mêmes logs s'envoient si webhook configuré

## Aide & Support

- Lisez le `README.md` complet
- Vérifiez les logs dans la console
- Testez avec 1 serveur d'abord
- Activez les webhooks pour meilleure visibilité

---

**Version 1.0.0** - Happy Bumping! 🚀
