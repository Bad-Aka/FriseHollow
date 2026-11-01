# Intégrer les Chroniques au launcher Hollow

Le module reprend le premier site et ses quatre frises. Le même composant React assure la lecture, les recherches, les filtres, les détails, l’édition des dates et récits, le déplacement des cartes, l’ajout, la suppression, l’annulation et les sauvegardes JSON. Les illustrations restent définies automatiquement par frise. Aucun document interne du lore n’est livré avec cette version. Les images originales sont actuellement exclues du dépôt public en attente d’un accord explicite, après refus du contrôle automatique. La liste des fichiers attendus est dans `public/hollow/assets-manifest.json` ; la construction est possible mais les illustrations manquent dans une installation neuve du dépôt.

## Construire et afficher

Dans le dépôt FriseHollow : Node 22.13 minimum, `npm ci`, puis `npm run build`. Le dossier `dist-launcher` est le module à livrer. `npm run dev` lance le développement ; `npm run preview` sert la version construite. `npm run check` vérifie TypeScript et le catalogue public.

Charger `index.html?embed=1` depuis l’origine HTTP/HTTPS locale ou le protocole applicatif sécurisé du launcher. Le mode intégré retire le menu latéral et le pied de page qui feraient doublon ; les quatre sélecteurs et toutes les fonctions restent disponibles. `view=general`, `view=clover`, `view=diamond` et `view=neutre` choisissent la frise initiale. Les chemins sont relatifs : le module peut vivre sous un sous-dossier comme `/archives/`. Conserver le slash final du dossier ou ouvrir explicitement son `index.html`.

Le dossier peut être embarqué dans une WebView2, une vue Chromium ou une iframe de l’interface du launcher. Servir les fichiers sur une origine stable et conserver le profil utilisateur de la WebView pour retrouver les données. L’ouverture directe en `file://` n’est pas la méthode d’intégration prévue pour les modules ES et IndexedDB. JavaScript, les dialogues HTML et IndexedDB doivent rester activés.

Exemple d’intégration web :

```html
<iframe title="Les chroniques de Hollow"
  src="./archives/index.html?embed=1&view=clover"
  style="width:100%;height:100%;border:0"
  allow="clipboard-write"></iframe>
```

Autoriser les dialogues de fichiers et téléchargements pour cette origine, ou utiliser les fonctions natives ci-dessous. Si le launcher ajoute un `sandbox` à l’iframe, il doit prévoir les capacités de scripts, de formulaires, de téléchargements et de stockage selon sa politique ; ne pas désactiver globalement la sécurité de la WebView.

## Choisir le stockage

Sans pont natif, les données sont conservées en **IndexedDB sur cet appareil**, avec révisions pour détecter les éditions concurrentes. L’interface l’indique lors de l’édition. L’export/import JSON permet de transporter une sauvegarde. Ce mode fonctionne sans API ChatGPT et après installation des fichiers, sans réseau. Il n’effectue pas de synchronisation entre appareils, comptes ou avec le site privé.

Pour une chronologie partagée, injecter `window.hollowChroniclesHost` **avant** le chargement de `main.tsx`/du bundle. Le type complet est `HollowChroniclesHost` dans `launcher/storage.ts`. Le launcher remplace alors IndexedDB par son propre service authentifié :

```ts
window.hollowChroniclesHost = {
  version: 1,
  canEdit: currentUser.isLoreEditor,
  async loadTimeline() {
    // Retourner { board, revision } depuis le service du launcher.
    return nativeArchives.read();
  },
  async saveTimeline({ board, revision }) {
    // Contrôler le rôle côté service et refuser une révision périmée.
    // Écrire de façon atomique, puis retourner { revision: nouvelleRevision }.
    return nativeArchives.save({ board, revision });
  },
  async chooseBackup() {
    // Retourner le JSON analysé ; null si la personne annule.
    return nativeFiles.openJson();
  },
  async saveBackup(contents, filename) {
    // N’accorder au module que le dialogue d’enregistrement nécessaire.
    await nativeFiles.saveJson(contents, filename);
  },
};
```

`nativeArchives`, `nativeFiles` et `currentUser` illustrent les services que l’équipe du launcher doit fournir ; ils ne sont pas de faux services inclus. `chooseBackup` et `saveBackup` sont facultatifs ; sans eux, les sélecteurs et téléchargements du navigateur sont utilisés. Le module valide chaque chronologie entrante et exige une confirmation de révision après sauvegarde. `canEdit: false` masque les commandes d’écriture ; l’autorisation doit également être contrôlée par le service natif. Ne pas fournir de pont natif à des pages externes ni de jeton administrateur au JavaScript.

Pour conserver le stockage du site actuel, l’équipe doit intégrer un adaptateur authentifié correspondant à ses comptes ou utiliser les exports/imports. Le site hébergé reste privé avec sa connexion existante : le paramètre `embed=1` est une option de présentation, jamais un accès sans authentification.

## Vérifications réalisées et limite d’intégration

Le module autonome est construit séparément et vérifié dans une iframe de 850 × 760, ainsi qu’en vue mobile de 390 × 844. L’ajout d’un événement daté, sa présence après rechargement et sa suppression sont vérifiés dans la vraie interface. `npm run dev`, puis ouvrir `/storage-check.html`, permet de relancer neuf contrôles : stockage réel IndexedDB, persistance, concurrence, import public, refus des données non publiables, lecture/écriture native, fichiers natifs, lecture seule et confirmation des révisions.

Le dépôt FriseHollow était vide au départ et ne contient pas le programme du launcher Hollow. Le module est prêt à y être chargé ; le branchement du pont sur les vrais comptes et le test dans l’exécutable du launcher restent à réaliser par son équipe, avec ce contrat d’intégration.
