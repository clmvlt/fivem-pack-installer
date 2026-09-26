# FiveM Pack Manager

[![CI](https://github.com/clmvlt/fivem-pack-installer/actions/workflows/ci.yml/badge.svg)](https://github.com/clmvlt/fivem-pack-installer/actions/workflows/ci.yml)

Installer, changer et retirer des packs graphiques FiveM (NVE, QuantV, ENB, ReShade, mods `.rpf`) sans déplacer de fichiers à la main.

**Télécharger** : [dernière version sur GitHub](https://github.com/clmvlt/fivem-pack-installer/releases/latest) (installateur ou version portable), aussi accessible depuis [packs.dimzou.fr/application](https://packs.dimzou.fr/application).

## Utilisation

- **Bibliothèque** : vos packs en cartes avec leur image. Glissez une archive `.zip`, `.rar` ou `.7z` (ou un dossier) dans la fenêtre, ou cliquez sur « Ajouter un pack… ». « Installer » met le pack en place ; le pack installé auparavant est retiré automatiquement. « Retirer » remet le jeu dans son état d'origine.
- **Marketplace** : les packs publiés sur [packs.dimzou.fr](https://packs.dimzou.fr). « Télécharger » ajoute le pack à la bibliothèque avec son nom, ses images et sa description ; il s'installe ensuite comme les autres. Quand l'auteur publie une nouvelle version, « Mettre à jour » la télécharge, garde vos réglages et votre preset ReShade, et la met en place si l'ancienne était installée.
- **Fiche d'un pack** (clic sur une carte) : images, informations, compatibilité FiveM (version de ReShade et d'ENB, builds déclarées par les `.asi`, validité des `.rpf`), contenu et destination de chaque partie, liste des fichiers.
- **Preset ReShade** : l'application repère les presets du pack et fait pointer `ReShade.ini` sur le bon à chaque installation (celui prévu par l'auteur, ou celui choisi dans la fiche du pack). Plus besoin de l'ouvrir en jeu. Un preset choisi dans le menu de ReShade en jeu est retenu pour les fois suivantes. Avec QuantV, qui impose à ReShade son fichier `QuantV.preset.ini`, le preset choisi y est aussi recopié (avec les effets QuantV s'ils manquent) ; les réglages QuantV retouchés en jeu sont gardés tant que le preset ne change pas.
- **Images** : celles fournies dans le pack, sinon la dernière capture ReShade prise pendant que le pack était installé. « Changer l'image… » permet d'en choisir une.
- **Graphismes** : réglages graphiques du jeu (fichier `%APPDATA%\CitizenFX\gta5_settings.xml` de FiveM, et `settings.xml` de GTA V solo s'il existe), préréglages, recommandations du pack installé (DirectX 11, post-traitement, MSAA). L'original est sauvegardé avant la première modification et peut être restauré. L'enregistrement est bloqué tant que FiveM tourne, car le jeu réécrit ce fichier en quittant.
- **Limite d'images par seconde** (page Graphismes) : 60, 90, 120, 144, 165 ou 240 FPS, aucune limite, ou celle du pack. FiveM n'a pas de limite à lui : elle est écrite dans l'`enblocal.ini` (section `[LIMITER]`) des packs qui utilisent ENB, à chaque installation et tout de suite pour le pack installé. Pour un pack sans ENB, il faut passer par le panneau NVIDIA ou AMD.
- **Nettoyage** : remise d'origine du jeu en un clic, mods installés à la main (à cocher puis « Ranger dans un pack »), captures d'écran ReShade (déplacer dans Images ou mettre à la corbeille), cache de FiveM à vider.
- **Réglages** : dossiers FiveM, GTA V et bibliothèque avec les informations de détection, dernières opérations, version de l'application et recherche de mise à jour.
- **Mises à jour** : entièrement automatiques. L'application vérifie au démarrage puis toutes les heures ; une nouvelle version est téléchargée en arrière-plan, vérifiée (signature de la version, empreinte du fichier), puis installée à la fermeture de l'application, sans rien demander. « Redémarrer maintenant » (en bas de la barre latérale) l'installe tout de suite. La version portable se remplace elle-même à la fermeture. Lancée depuis ses sources, l'application signale seulement la nouvelle version, à télécharger sur le site.

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

## Confidentialité

Aucun compte, aucune mesure d'audience, aucune donnée personnelle collectée. L'application ne communique qu'avec packs.dimzou.fr : peu après le démarrage puis toutes les heures pour chercher une mise à jour (sans identifiant), à l'ouverture de la Marketplace pour lister les packs, et quand vous téléchargez un pack ou une mise à jour. Comme pour tout site web, le serveur reçoit l'adresse IP de ces requêtes. `PM_NO_UPDATE=1` désactive la recherche de mises à jour.

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
- `src/main/core/updater.ts`, `portableSwap.ts` et `releaseSignature.ts` : mises à jour automatiques de l'application (installateur et version portable) et vérification de leur signature.
- `src/renderer/` : interface.

L'API utilisée est `https://packs.dimzou.fr/api`, sauf avec `npm run dev` où c'est l'API de dev du poste (`http://192.168.1.13:8080/api`, projet `packs_api`).

Variables pour les tests : `PM_DATA_DIR` (autre dossier de données), `PM_FORCE_ELEVATION=1`, `PM_NO_UAC=1`, `PM_API_URL` (autre adresse d'API) et `PM_UPDATER_DEV=1` (mises à jour de l'installateur actives hors version installée, avec `dev-app-update.yml`) et `PM_NO_UPDATE=1` (aucune recherche de mise à jour).

## Publier une nouvelle version

La compilation et la publication se font sur GitHub (Actions, machines Windows) :

- **CI** (`.github/workflows/ci.yml`) : à chaque push et pull request, typage, tests, puis installateur et version portable, téléchargeables dans les artefacts de l'exécution.
- **Publication** (`.github/workflows/release.yml`) : poussez un tag `vX.Y.Z` identique à la version de `package.json`. Le workflow teste, compile, signe les fichiers, crée la release GitHub, puis met la version en ligne sur packs.dimzou.fr : les applications installées la téléchargent, la vérifient et l'installent seules.

Une fois la nouvelle version committée dans `package.json` (et, si vous voulez, `notes/X.Y.Z.md`) :

```bash
npm run release                  # vérifie, pousse le tag vX.Y.Z et suit la publication jusqu'au bout
npm run release -- --dry-run     # montre ce qui serait fait, sans rien pousser
npm run release -- --no-watch    # pousse le tag sans attendre la fin
```

Le script ne crée aucun commit. Il refuse de partir si des fichiers ne sont pas committés ou si la version est déjà publiée, pousse les commits pas encore envoyés, crée le tag, puis suit le workflow (GitHub CLI `gh`) et vérifie la release GitHub et packs.dimzou.fr.

Nouveautés affichées sur le site et dans la release : `notes/X.Y.Z.md` s'il existe, sinon la liste des commits depuis le tag précédent.

Secrets du dépôt (Settings, Secrets and variables, Actions) :

| Secret | Contenu |
|---|---|
| `PM_SIGNING_KEY` | contenu du fichier `.pem` de la clé de publication |
| `PACKS_ADMIN_USER` | compte d'administration du site (`admin` par défaut) |
| `PACKS_ADMIN_PASSWORD` | son mot de passe |

Sans ces secrets, la release GitHub est créée mais la version n'est pas mise en ligne sur le site.

### Publication depuis un poste

`deploy/deploy.py` (`npm run release:local`) fait la même chose en local (build, signature, envoi, publication) :

```bash
python -m pip install -r deploy/requirements.txt
python deploy/deploy.py --check                         # clé, fichiers, API et connexion, sans rien modifier
python deploy/deploy.py --notes-file nouveautes.md      # build, signature, envoi et publication
```

- `--no-build` : publie les fichiers déjà présents dans `release/` (par exemple ceux d'une release GitHub). Sur un poste où Smart App Control est actif, electron-builder ne peut pas construire l'installateur.
- `--draft` : envoie sans publier (publication ensuite depuis « Versions de l'app » dans l'administration).
- `--dev` : API de dev au lieu de la production.

Configuration : `PACKS_ADMIN_USER` et `PACKS_ADMIN_PASSWORD` dans `deploy/deploy.env` (jamais versionné), modèle `deploy/deploy.env.example`.

### Clé de publication

La clé privée est dans `%USERPROFILE%\.fivem-pack-manager\release-signing-key.pem` (ou `PM_SIGNING_KEY`) et dans le secret GitHub `PM_SIGNING_KEY`. Elle ne doit jamais être versionnée ; gardez-en une copie de sauvegarde : sans elle, plus aucune mise à jour automatique n'est possible pour les versions déjà installées. Pour signer un fichier à la main : `node scripts/sign-release.mjs <fichier.exe>`.

L'application n'installe une mise à jour que si la signature correspond à la clé publique qu'elle contient (`src/main/core/releaseSignature.ts`) : ni le serveur ni un compte d'administration volé ne peuvent faire installer autre chose. Les versions antérieures à 1.3.0 n'ont pas les mises à jour automatiques : la 1.3.0 s'installe à la main.

## Limites

- Les archives protégées par mot de passe doivent être extraites avant.
- Les packages OpenIV (`.oiv`) concernent GTA V solo et ne sont pas installés.

## Signature du code

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

Les fichiers publiés (installateur, version portable, exécutable de l'application) sont construits par GitHub Actions à partir de ce dépôt et d'un tag `vX.Y.Z`, puis signés après approbation manuelle. Auteurs, relecteurs et approbateurs : [clmvlt](https://github.com/clmvlt). Les composants d'autres projets (Electron, 7-Zip, unRAR) sont livrés tels que publiés par leurs auteurs. Politique complète : [packs.dimzou.fr/signature](https://packs.dimzou.fr/signature).

## Licence

MIT, voir [LICENSE](LICENSE).
