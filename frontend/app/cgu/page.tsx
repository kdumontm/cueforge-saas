'use client';

import { ArrowLeft, Shield } from 'lucide-react';
import Link from 'next/link';

export default function CGUPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-gray-400 hover:text-white transition">
            <ArrowLeft size={18} />
            Retour
          </Link>
          <h1 className="text-xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            CueForge
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <Shield size={32} className="text-green-400" />
          <h2 className="text-3xl font-bold">Conditions Generales d&apos;Utilisation</h2>
        </div>
        <p className="text-gray-400 mb-8">Derniere mise a jour : Mars 2026</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h3 className="text-xl font-semibold text-white mb-3">1. Objet</h3>
            <p>
              Les presentes Conditions Generales d&apos;Utilisation (CGU) regissent l&apos;acces et l&apos;utilisation
              du service CueForge, plateforme SaaS d&apos;analyse audio et de preparation de morceaux
              destinee aux DJs professionnels et amateurs.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold text-white mb-3">2. Acces au service</h3>
            <p>
              L&apos;inscription est gratuite et donne acces au plan Free. L&apos;utilisateur doit fournir
              une adresse e-mail valide et un mot de passe. L&apos;acces aux fonctionnalites avancees
              necessite la souscription a un abonnement payant (Pro ou App Desktop).
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold text-white mb-3">3. Plans et tarification</h3>
            <p className="mb-2">CueForge propose trois niveaux de service :</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400 ml-4">
              <li><span className="text-white font-medium">Free</span> : 5 morceaux par jour, fonctionnalites de base</li>
              <li><span className="text-white font-medium">Pro</span> : 20 morceaux par jour, toutes les fonctionnalites en ligne</li>
              <li><span className="text-white font-medium">App Desktop</span> : morceaux illimites via l&apos;application desktop</li>
            </ul>
            <p className="mt-2">
              Les tarifs sont indiques en euros TTC. CueForge se reserve le droit de modifier
              ses tarifs avec un preavis de 30 jours.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold text-white mb-3">4. Propriete intellectuelle</h3>
            <p>
              L&apos;utilisateur reste pleinement proprietaire de ses fichiers audio. CueForge n&apos;acquiert
              aucun droit sur les morceaux uploades. Les fichiers sont stockes temporairement
              pour le traitement et peuvent etre supprimes a tout moment par l&apos;utilisateur.
            </p>
            <p className="mt-2">
              Le logiciel CueForge, son interface, ses algorithmes et sa marque sont la propriete
              exclusive de CueForge SAS. Toute reproduction non autorisee est interdite.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold text-white mb-3">5. Protection des donnees</h3>
            <p>
              CueForge s&apos;engage a proteger les donnees personnelles de ses utilisateurs
              conformement au Reglement General sur la Protection des Donnees (RGPD).
              Les donnees collectees sont : adresse e-mail, nom, historique d&apos;utilisation.
              Aucune donnee n&apos;est revendue a des tiers.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold text-white mb-3">6. Utilisation acceptable</h3>
            <p>L&apos;utilisateur s&apos;engage a :</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400 ml-4 mt-2">
              <li>Ne pas uploader de contenu illegal ou portant atteinte aux droits d&apos;autrui</li>
              <li>Ne pas tenter de contourner les limitations du plan gratuit</li>
              <li>Ne pas utiliser le service a des fins de piratage ou de distribution illegale</li>
              <li>Ne pas surcharger les serveurs par des requetes automatisees excessives</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xl font-semibold text-white mb-3">7. Responsabilite</h3>
            <p>
              CueForge fournit son service &quot;en l&apos;etat&quot;. Bien que nous nous efforcions
              d&apos;assurer la precision des analyses audio (BPM, tonalite, points cue),
              CueForge ne garantit pas une precision absolue. L&apos;utilisateur reste responsable
              de la verification des resultats avant utilisation en conditions live.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold text-white mb-3">8. Resiliation</h3>
            <p>
              L&apos;utilisateur peut resilier son compte a tout moment depuis les parametres
              de son profil. La resiliation entraine la suppression des donnees sous 30 jours.
              Les abonnements en cours ne sont pas rembourses au prorata.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold text-white mb-3">9. Modifications des CGU</h3>
            <p>
              CueForge se reserve le droit de modifier les presentes CGU a tout moment.
              Les utilisateurs seront informes par e-mail de toute modification substantielle.
              La poursuite de l&apos;utilisation du service apres modification vaut acceptation.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold text-white mb-3">10. Droit applicable</h3>
            <p>
              Les presentes CGU sont soumises au droit francais. Tout litige sera soumis
              aux tribunaux competents de Paris, France.
            </p>
          </section>

          <section className="border-t border-gray-800 pt-8 mt-8">
            <p className="text-gray-500 text-sm">
              Pour toute question concernant ces conditions, contactez-nous a :
              <a href="mailto:contact@cueforge.app" className="text-green-400 hover:underline ml-1">
                contact@cueforge.app
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

