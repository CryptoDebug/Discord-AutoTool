# Discord AutoTool

Un outil complet pour gérer automatiquement vos serveurs Discord avec deux features principales:
- **AutoBump**: Bump automatique via Disboard avec support multi-tokens
- **AutoSender**: Envoi de messages récurrents sur plusieurs salons

## 🚀 Installation & Lancement

### Windows (Facile)
```bash
# Double-cliquez sur start.bat
# OU via terminal:
npm install
npm start
```

### Linux/Mac
```bash
npm install
npm start
```

## 📋 Features

### 🚀 AutoBump
- ✅ Multi-tokens avec rotation automatique
- ✅ Humanization (1-15 min aléatoire entre bumps)
- ✅ Groupes de tokens pour organisation
- ✅ Vérification permissions avant bump
- ✅ Gestion des erreurs: account disabled, rate limits, permissions
- ✅ Logging complet via console + webhooks Discord

### 💬 AutoSender
- ✅ Envoi de messages récurrents
- ✅ Support salons globaux ou groupes
- ✅ Délais personnalisables par message/salon
- ✅ Variables: {date}, {time}, {timestamp}, {random}
- ✅ Gestion slowmode, mute, salons supprimés
- ✅ Logging d'erreurs complet

### 🎛️ Interfaces
- **GUI Web**: http://localhost:3000 (Express + EJS)
- **CLI Terminal**: Menu interactif avec choix détaillés
- **Webhooks Discord**: Notifications en temps réel

## 📁 Structure du Projet

```
discord-autotool/
├── src/
│   ├── main.js                 # Point d'entrée
│   ├── cli/
│   │   └── cli-mode.js         # Interface CLI
│   ├── gui/
│   │   ├── app.js              # Express server
│   │   ├── views/              # Templates EJS
│   │   └── public/             # CSS/JS statiques
│   ├── features/
│   │   ├── autobump/           # Feature bump
│   │   ├── autosender/         # Feature sender
│   │   └── logging.js          # Système de logs
│   └── config/
│       └── manager.js          # Gestion config
├── config/                     # Fichiers config JSON
├── package.json
├── start.bat
└── README.md
```

## ⚙️ Configuration

### Démarrage
Au lancement, vous pouvez choisir entre:
```
🌐 GUI (Web - localhost:3000)
⌨️  CLI (Terminal)
```

### Tokens
1. Allez dans "🔑 Gestion Tokens"
2. Entrez votre token Discord
3. Organisez-les en groupes (ex: "bump", "sender", "nsfw")

### AutoBump
1. Configurez vos tokens
2. Allez dans "🚀 AutoBump"
3. Paramètres:
   - **Humanization**: Actif (1-15 min aléatoire) ou Désactivé (30.5 min fixes)
   - **Max serveurs/token**: Défaut 4 (warning au-delà)
4. Ajoutez vos serveurs avec leur salon de bump
5. Cliquez "Démarrer"

### AutoSender
1. Configurez vos messages
2. Choisissez tokens et salons
3. Définissez délais personnalisés si besoin
4. Cliquez "Démarrer"

### Webhooks (Optional)
Pour recevoir des notifications Discord:
1. Créez un webhook dans vos serveurs Discord
2. Copiez l'URL
3. Collez-la dans "🪝 Webhooks"
4. Choisissez ce que vous voulez logger

## 📊 Fichiers de Config

Tous les fichiers de configuration sont en JSON dans le dossier `/config`:

- `tokens.json` - Vos tokens Discord
- `bump-config.json` - Configuration AutoBump
- `sender-config.json` - Configuration AutoSender
- `groups.json` - Groupes de tokens/salons
- `webhooks.json` - Configuration webhooks

## 🪵 Logging

### Console
Logs en temps réel dans le terminal/GUI

### Discord Webhook
```
✅ Succès: Bumps, messages envoyés
❌ Erreurs: Comptes disabled, permissions, salons supprimés
⚠️  Avertissements: Slowmode, mute, rate limits
```

## 🛠️ Déploiement Exécutable

Pour créer un .exe autonome (optionnel):
```bash
npm run build
```

Cela crée `discord-autotool.exe` qui ne nécessite pas Node.js installé.

## ⚠️ Limitations

- **Max 4 serveurs par token** recommandé (configurable)
- **Disboard bump**: 1 bump/2h01 par serveur
- **Rate limit Discord**: Gestion automatique avec retry

## 🔒 Sécurité

- Tokens stockés localement en JSON (à protéger!)
- Pas de connexion à serveurs externes
- Webhooks optionnels et configurables
- Vérification permissions avant actions

## 📝 Logs d'Erreurs

L'outil gère automatiquement:
- ✅ Compte disabled → Désactivation auto
- ✅ Rate limited → Retry dans 5 min
- ✅ Permissions insuffisantes → Log + continue
- ✅ Salon supprimé → Skip + continue
- ✅ Serveur supprimé → Skip + continue
- ✅ Compte mute → Log + continue
- ✅ Slowmode → Log + continue

## 🆘 Troubleshooting

### "Node.js not found"
→ Installez Node.js depuis https://nodejs.org/

### "Token invalide"
→ Vérifiez que vous avez copié le bon token de votre compte

### "Permission denied on slash command"
→ L'outil ne peut pas utiliser les slash commands dans ce salon
→ Vérifiez les permissions du bot/compte

### "Rate limited"
→ Normal, l'outil attend 5 min et retry automatiquement

## 📞 Support

Pour des erreurs ou bugs:
1. Vérifiez les logs dans le webhook Discord
2. Vérifiez les paramètres de configuration
3. Redémarrez l'outil

## 📜 License

MIT

---

**Version**: 1.0.0  
**Made with ❤️ for Discord automation**
