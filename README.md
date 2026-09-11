# Mon assistant

Application personnelle installable : tâches, courses, finances, calendrier, notes, cuisine et lieux.

## Déploiement Vercel

1. Ajoutez tous les fichiers de cette archive à la racine du dépôt GitHub.
2. Dans Vercel, importez le dépôt comme projet Other / Static site. Aucune commande de build n'est requise.
3. Dans Settings → Deployment Protection, désactivez la protection Vercel Authentication si vous voulez un lien public.

## Données

Les données sont enregistrées dans le navigateur grâce à localStorage. Utilisez Paramètres → Exporter une sauvegarde avant de changer d'appareil ou de navigateur.

## Connexions externes

Gmail, iCloud Mail, iCloud Calendar et une IA externe nécessitent un serveur sécurisé et des identifiants OAuth. Ne placez jamais de clé API, mot de passe ou identifiant dans app.js ou dans GitHub.
