# Firebase setup for the current terrain branch

This integration adds Google login and saves the four Plane controls (Plane Res, Noise Res, Displace, Fog) to the signed-in user's Firestore document. Noise layers and erosion simulation are not yet saved. Hosting serves the Vite build from `dist`.

1. Install dependencies: `cd my-react-app` then `npm install`.
2. Copy `.env.example` to `.env.local`. Copy the four matching values from Firebase console > Project settings > Your apps > PWB > SDK setup and configuration. Keep `.env.local` on your computer; it is ignored by Git.
3. In Firestore > Rules, replace the old rotation/scale rule with the `firestore.rules` file in this folder, and publish it. The old rule rejects the new terrain document format.
4. Check Authentication > Settings > Authorized domains. Add the domain where the app runs if it is missing. For local development use localhost; for Hosting use the deployed Firebase Hosting domain.
5. Run `npm run dev` to verify Google login and save/load. For Hosting, run `npm run build`, `firebase login`, `firebase use --add` to choose the existing project, then `firebase deploy --only hosting,firestore:rules` from `my-react-app`.

The `.env.local` Firebase Web config identifies the project; access to each user's saved data is controlled by the Firestore rules, not by keeping the Web config private.
