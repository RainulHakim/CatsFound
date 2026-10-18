import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How CatFound, the Davidson College lost and found, works: post found items in seconds, search what's been found, and pick valuables up at the Alvarez Union desk.",
  alternates: { canonical: "/about" },
};

const FAQ: [string, string][] = [
  [
    "Where is the Davidson lost and found?",
    "The lost and found desk is at the Alvarez College Union. CatFound lists what's been handed in, so you can check before you walk over.",
  ],
  [
    "I found something. What do I do?",
    'Tap "I found something", take a photo, pick what it is and which building you found it in, then drop it at the Union desk or another listed drop-off point. You don\'t need an account.',
  ],
  [
    "I lost something. How do I find it?",
    "Browse or search the found items. If you see yours, pick it up at the drop-off point shown on the item. Bring your Davidson ID.",
  ],
  [
    "Why don't wallets, phones and keys have photos?",
    "Valuables like wallets, IDs, cards, keys, phones and laptops are listed without photos or details, so only the real owner can describe them. They're always kept at the Alvarez Union desk and handed back by staff.",
  ],
  [
    "Who can see where I found something?",
    "Only the building is shown, never an exact location. Nobody can see who posted an item.",
  ],
  [
    'What\'s the "only the owner would know" detail?',
    "An optional detail the finder adds, like a scratch or sticker. It's kept hidden and is used to check that the person claiming an item really owns it.",
  ],
];

export default async function AboutPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "CatFound",
      url: site,
      description: "A student-run lost and found for Davidson College.",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6">
      <script
        type="application/ld+json"
        nonce={nonce}
        // JSON.stringify output with "<" escaped cannot break out of the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <h1 className="text-3xl font-bold">How CatFound works</h1>
      <p className="text-muted text-lg">
        CatFound is a student-run lost and found for Davidson College, run with the Alvarez College
        Union. Anyone who finds something can post it in seconds; anyone who's lost something can
        see what's been handed in.
      </p>
      <dl className="flex flex-col gap-5">
        {FAQ.map(([q, a]) => (
          <div key={q} className="flex flex-col gap-1">
            <dt className="text-lg font-semibold">{q}</dt>
            <dd className="text-muted">{a}</dd>
          </div>
        ))}
      </dl>
      <p>
        <Link href="/found/new">Post a found item</Link> ·{" "}
        <Link href="/items">Browse found items</Link>
      </p>
    </article>
  );
}
