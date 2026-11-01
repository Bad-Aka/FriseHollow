# Hollow — Les chroniques du lore

Le premier site Hollow : quatre frises chronologiques éditables, une identité noire et argent, les illustrations originales et des couleurs fixes pour chaque faction. Cette version autonome est prête à être intégrée au launcher.

## Démarrage

Node.js 22.13 minimum.

```sh
npm ci
npm run dev
```

Le serveur indique son adresse. Ajouter `?embed=1` pour afficher la version intégrée et `&view=clover` pour choisir une frise initiale. Les autres valeurs sont `general`, `diamond` et `neutre`.

```sh
npm run check
npm run build
npm run preview
```

Le dossier `dist-launcher` contient la version à distribuer. **Les visuels originaux ne sont pas encore publiés dans ce dépôt public.** Leur transfert a été bloqué par le contrôle automatique, qui demande un accord explicite. Le site existant les conserve. Le code se construit ; les images restent à ajouter après autorisation. `public/hollow/assets-manifest.json` contient uniquement la liste et les empreintes attendues.

## Fonctions

- Vues générale, Clover, Diamond et Zone neutre ; illustrations automatiques.
- Transitions animées et respect des préférences de réduction des mouvements.
- Recherche, filtres, vue liste/frise, zoom, déplacement et navigation rapide.
- Lecture des récits avec précédent/suivant et aperçu au survol.
- Ajout, modification, date, ordre, suppression, annulation et import/export JSON.
- Stockage persistant IndexedDB avec contrôle des révisions ; pont natif facultatif pour les données et les fichiers du launcher.
- Interface compacte adaptée à une WebView, aux petites fenêtres et au mobile.

## Intégration au launcher

Le guide complet est `docs/launcher-integration.md`. Le contrat natif est `HollowChroniclesHost` dans `launcher/storage.ts`. Le launcher injecte ce pont avant le chargement du module pour utiliser ses comptes, ses autorisations et sa base partagée. Avec `canEdit: false`, les joueurs disposent de la lecture seule ; le service doit aussi vérifier les permissions d’écriture.

Sans pont natif, les modifications sont conservées sur l’appareil. Elles ne sont pas synchronisées automatiquement avec le site privé ou les autres joueurs. Le programme du launcher n’était pas présent dans ce dépôt : son chargement réel et le raccordement aux comptes restent à brancher côté launcher.

## Contrôles

`npm run check` vérifie les types et le catalogue public. Pour les neuf tests de stockage et du pont natif, lancer `npm run dev`, puis ouvrir `/storage-check.html`. Ils utilisent une base de test distincte et affichent leurs résultats dans la page. `npm run build:storage-check` en construit une version autonome dans `work/launcher-check`.

Le catalogue ne contient que 38 faits passés destinés aux joueurs, avec des dates incertaines lorsqu’elles ne sont pas établies. Les causes cachées et les événements à venir ne sont pas inclus. Les fichiers internes du lore et les sauvegardes privées du site ne font pas partie de ce dépôt.

## Palette

| Faction | Couleur |
| --- | --- |
| Clover | `#46E6A5` |
| Diamond | `#65B6FF` |
| Villages neutres | `#FFC861` |
| Déliées | `#FF6483` |
| Histoire commune | `#B69AFF` |

La vue générale utilise l’or pour sa navigation. Les cartes conservent toujours leur couleur de faction. Les chemins des visuels originaux sont définis dans `lib/visuals.ts`. Les illustrations restent décoratives et n’attribuent aucun rôle aux personnages dans le lore.
