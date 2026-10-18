import {
  Backpack,
  BookOpen,
  BookUser,
  Cable,
  Calculator,
  CreditCard,
  CupSoda,
  Gem,
  Glasses,
  Handbag,
  Headphones,
  IdCard,
  KeyRound,
  Laptop,
  Package,
  Pill,
  Shirt,
  Smartphone,
  Snowflake,
  Tag,
  Umbrella,
  Volleyball,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// Explicit map (not a dynamic lookup) so only these icons are bundled.
const ICONS: Record<string, LucideIcon> = {
  "cup-soda": CupSoda,
  headphones: Headphones,
  shirt: Shirt,
  backpack: Backpack,
  cable: Cable,
  glasses: Glasses,
  snowflake: Snowflake,
  tag: Tag,
  "book-open": BookOpen,
  umbrella: Umbrella,
  calculator: Calculator,
  volleyball: Volleyball,
  package: Package,
  "key-round": KeyRound,
  wallet: Wallet,
  "id-card": IdCard,
  "credit-card": CreditCard,
  smartphone: Smartphone,
  laptop: Laptop,
  handbag: Handbag,
  "book-user": BookUser,
  pill: Pill,
  gem: Gem,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Package;
  return <Icon aria-hidden="true" className={className} />;
}
