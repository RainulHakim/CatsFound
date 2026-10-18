import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What CatFound collects, why, who can see it and how long it's kept.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-3xl font-bold">Privacy</h1>
      <p className="text-muted">Plain-language summary. Last updated October 2026.</p>

      <h2 className="text-xl font-semibold">What we collect</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          <strong>Photos of found items.</strong> We re-encode every photo on our server, which
          removes hidden data such as the GPS location your phone stores in pictures.
        </li>
        <li>
          <strong>What it is, which building, and the date.</strong> Only the building is recorded,
          never an exact spot. If you let the form sort buildings by distance, your location stays
          on your phone and is never sent to us.
        </li>
        <li>
          <strong>An optional "only the owner would know" detail.</strong> Stored encrypted and
          never shown publicly.
        </li>
        <li>
          <strong>A hashed version of your IP address</strong>, used only to stop spam and abuse. We
          never store the raw address.
        </li>
      </ul>

      <h2 className="text-xl font-semibold">What we don't collect</h2>
      <p>
        You don't need an account to post, and we don't ask for your name. We don't use advertising
        or tracking cookies. The only cookie we set remembers your light/dark theme choice.
      </p>

      <h2 className="text-xl font-semibold">Who can see what</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Nobody can see who posted an item.</li>
        <li>
          Valuables (wallets, IDs, cards, keys, phones, laptops, passports, medication, jewelry) are
          listed without photos or descriptions.
        </li>
        <li>Found items aren't shown to search engines.</li>
      </ul>

      <h2 className="text-xl font-semibold">How long we keep it</h2>
      <p>Items and their photos are deleted 90 days after they're collected or archived.</p>

      <h2 className="text-xl font-semibold">Questions</h2>
      <p>Ask at the Alvarez College Union desk.</p>
    </article>
  );
}
