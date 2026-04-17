# Football Shop (catalogue + commandes WhatsApp)

Petit site pour vendre des affaires de foot :
- Catalogue de produits (depuis `data/products.json`)
- Panier simple (quantité + taille si nécessaire)
- Bouton **Commander** qui envoie la commande sur WhatsApp via un lien pré-rempli
- Paiement : **après confirmation** via Airtel Money (tu réponds ensuite côté WhatsApp)

## Prérequis
- Node.js 18+ (idéalement 20+)
- Ton numéro WhatsApp Business en format international (ex: `+2416...`)

## Installation locale
1. `cd football-shop`
2. Crée un fichier `.env` à partir de `.env.example` et mets :
   - `WHATSAPP_SELLER_NUMBER` : digits uniquement (sans `+`)
     - Exemple : `+241612345678` -> `241612345678`
3. Lance le serveur :
   - `node server-native.js`
   - (optionnel) si tu as `npm` : `npm run dev`
4. Ouvre `http://localhost:3000`

## Modifier les produits
Édite `data/products.json` :
- `id` (string)
- `name`, `description`, `price`
- `sizes` (tableau) si tu veux que le client choisisse une taille
- `imageUrl` (optionnel)

## Réception des commandes
Ici, quand le client clique **Commander**, il ouvre WhatsApp avec un message pré-rempli.
Ensuite le client envoie le message et toi tu reçois la commande.

Pour une notification “automatique” côté vendeur sans que le client clique envoyer, il faut l’API WhatsApp Business (plus avancé).

