# FiveM Pack Manager

Installer, changer et retirer des packs graphiques FiveM (NVE, QuantV, ENB, ReShade, mods `.rpf`) sans déplacer de fichiers à la main.

## Utilisation

- **Bibliothèque** : vos packs en cartes avec leur image. Glissez une archive `.zip`, `.rar` ou `.7z` (ou un dossier) dans la fenêtre, ou cliquez sur « Ajouter un pack… ». « Installer » met le pack en place ; le pack installé auparavant est retiré automatiquement. « Retirer » remet le jeu dans son état d'origine.
- **Marketplace** : les packs publiés sur [packs.dimzou.fr](https://packs.dimzou.fr). « Télécharger » ajoute le pack à la bibliothèque avec son nom, ses images et sa description ; il s'installe ensuite comme les autres. Quand l'auteur publie une nouvelle version, « Mettre à jour » la télécharge, garde vos réglages et votre preset ReShade, et la met en place si l'ancienne était installée.
- **Fiche d'un pack** (clic sur une carte) : images, informations, compatibilité FiveM (version de ReShade et d'ENB, builds déclarées par les `.asi`, validité des `.rpf`), contenu et destination de chaque partie, liste des fichiers.
- **Preset ReShade** : l'application repère les presets du pack et fait pointer `ReShade.ini` sur le bon à chaque installation (celui prévu par l'auteur, ou celui choisi dans la fiche du pack). Plus besoin de l'ouvrir en jeu. Un preset choisi dans le menu de ReShade en jeu est retenu pour les fois suivantes.
- **Images** : celles fournies dans le pack, sinon la dernière capture ReShade prise pendant que le pack était installé. « Changer l'image… » permet d'en choisir une.
- **Graphismes** : réglages graphiques du jeu (fichier `%APPDATA%\CitizenFX\gta5_settings.xml` de FiveM, et `settings.xml` de GTA V solo s'il existe), préréglages, recommandations du pack installé (DirectX 11, post-traitement, MSAA). L'original est sauvegardé avant la première modification et peut être restauré. L'enregistrement est bloqué tant que FiveM tourne, car le jeu réécrit ce fichier en quittant.
- **Nettoyage** : remise d'origine du jeu en un clic, mods installés à la main (à cocher puis « Ranger dans un pack »), captures d'écran ReShade (déplacer dans Images ou mettre à la corbeille), cache de FiveM à vider.
- **Réglages** : dossiers FiveM, GTA V et bibliothèque avec les informations de détection, dernières opérations, version de l'application et recherche de mise à jour.
- **Mises à jour** : l'application vérifie au démarrage puis toutes les 6 heures s'il existe une nouvelle version. Elle apparaît en bas de la barre latérale ; « Mettre à jour » la télécharge, vérifie sa signature, puis « Redémarrer » l'installe. La version portable indique seulement qu'une nouvelle version est disponible sur le site.

Clic droit (ou `⋯`) sur un pack : renommer, changer l'image, ouvrir le dossier, supprimer.

Les mods installés à la main avant l'application apparaissent sur la carte « Mods installés à la main ». Au premier « Installer » ou « Retirer », ils sont rangés dans un pack « Ancienne installation » : on peut y revenir à tout moment.

## Ce que fait l'application

- Elle reconnaît le contenu du pack et place chaque fichier au bon endroit :
  - `.rpf` dans `FiveM.app\mods` ;
  - ReShade, ENB (`d3d11.dll`) et plugins `.asi` dans `FiveM.app\plugins` ;
  - configuration ENB (`enbseries.ini`, `enblocal.ini`, `enbseries\`, `d3dcompiler_46e.dll`) à la racine de GTA V.
- Elle retrouve FiveM et GTA V seule (registre, lanceur Rockstar, Steam, Epic, `CitizenFX.ini`). Sinon, les dossiers se choisissent dans « Réglages ».
- Changer de pack est une seule opération : en cas d'échec, l'ancien pack reste installé tel quel.
- Elle ne supprime que les fichiers qu'elle a installés. Les captures d'écran ReShade et les fichiers d'origine du jeu ne sont jamais touchés.
- Un preset ReShade ou un `.ini` modifié en jeu est gardé et réinstallé la fois suivante.
- Si la bibliothèque et le jeu sont sur le même disque, les gros fichiers sont liés au lieu d'être copiés : l'installation est quasi instantanée et ne prend pas de place en plus.
- Si GTA V est dans `Program Files`, Windows demande l'autorisation administrateur au moment de l'installation.
- Elle ajoute à `CitizenFX.ini` la ligne d'acceptation que FiveM exige pour ReShade 5 et plus.

## Données

`%LOCALAPPDATA%\FiveM Pack Manager\` : bibliothèque de packs (`Bibliotheque\`), `settings.json`, `state.json`, `logs\`, cache des images de la Marketplace (`Marketplace\`). Le dossier des packs peut être déplacé depuis « Réglages ». Un téléchargement interrompu reprend là où il s'était arrêté (`Bibliotheque\.downloads\`).

## Développement

```bash
npm install
npm run dev
npm test
npm run dist
```

- `src/main/core/analyzer.ts` : reconnaissance du contenu d'un pack.
- `src/main/core/installer.ts` et `executor.ts` : installation, bascule, retrait.
- `src/main/core/games.ts` : détection de FiveM et de GTA V.
- `src/main/core/elevation.ts` : exécution avec les droits administrateur.
- `src/main/core/marketplace.ts` : Marketplace (liste, images en cache, téléchargement avec reprise, mises à jour de packs).
- `src/main/core/updater.ts` et `releaseSignature.ts` : mises à jour de l'application et vérification de leur signature.
- `src/renderer/` : interface.

L'API utilisée est `https://packs.dimzou.fr/api`, sauf avec `npm run dev` où c'est l'API de dev du poste (`http://192.168.1.13:8080/api`, projet `packs_api`).

Variables pour les tests : `PM_DATA_DIR` (autre dossier de données), `PM_FORCE_ELEVATION=1`, `PM_NO_UAC=1`, `PM_API_URL` (autre adresse d'API) et `PM_UPDATER_DEV=1` (mises à jour actives hors version installée, avec `dev-app-update.yml`).

## Publier une nouvelle version

Monter la version dans `package.json`, puis :

```bash
python -m pip install -r deploy/requirements.txt
python deploy/deploy.py --check                         # clé, fichiers, API et connexion, sans rien modifier
python deploy/deploy.py --notes-file nouveautes.md      # build, signature, envoi et publication
```

Le script construit l'installateur `release/FiveM-Pack-Manager-Setup-X.Y.Z.exe` et la version portable (`npm run dist`), signe chaque fichier avec la clé de publication, se connecte au compte d'administration du site, crée la version, envoie les fichiers en morceaux (un envoi interrompu reprend au lancement suivant), enregistre les signatures, publie puis vérifie que `latest.yml` annonce la nouvelle version.

- `--no-build` : publie les fichiers déjà présents dans `release/`. L'installateur doit être construit sur un poste où Smart App Control ne bloque pas electron-builder, ou avec un certificat de signature de code.
- `--draft` : envoie sans publier (publication ensuite depuis « Versions de l'app » dans l'administration).
- `--dev` : API de dev au lieu de la production.

Configuration : `PACKS_ADMIN_USER` et `PACKS_ADMIN_PASSWORD` dans `deploy.env` (le même fichier que pour le site et l'API, dans `PackInstaller/`), modèle `deploy/deploy.env.example`.

La clé privée de publication est dans `%USERPROFILE%\.fivem-pack-manager\release-signing-key.pem` (ou `PM_SIGNING_KEY`). Elle ne doit jamais être partagée ni versionnée ; gardez-en une copie de sauvegarde : sans elle, plus aucune mise à jour automatique n'est possible pour les versions déjà installées. Pour signer un fichier à la main : `node scripts/sign-release.mjs <fichier.exe>`.

L'application n'installe une mise à jour que si la signature correspond à la clé publique qu'elle contient (`src/main/core/releaseSignature.ts`) : ni le serveur ni un compte d'administration volé ne peuvent faire installer autre chose. Les versions antérieures à 1.3.0 n'ont pas les mises à jour automatiques : la 1.3.0 s'installe à la main.

## Limites

- Les archives protégées par mot de passe doivent être extraites avant.
- Les packages OpenIV (`.oiv`) concernent GTA V solo et ne sont pas installés.
#   f i v e m - p a c k - i n s t a l l e r  
 