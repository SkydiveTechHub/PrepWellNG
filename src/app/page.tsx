import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { TrustedBy } from "@/components/landing/trusted-by";
import { WhyUs } from "@/components/landing/why-us";
import { Showcase } from "@/components/landing/showcase";
import { Journey } from "@/components/landing/journey";
import { Subjects } from "@/components/landing/subjects";
import { DeepDive } from "@/components/landing/deep-dive";
import { Users } from "@/components/landing/users";
import { Testimonials } from "@/components/landing/testimonials";
import { StatsBand } from "@/components/landing/stats";
import { Pricing } from "@/components/landing/pricing";
import { MobileApp } from "@/components/landing/mobile-app";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

export const metadata = {
  title: "PrepWell NG — Learn Smarter. Score Higher. Build Your Future.",
  description:
    "Nigeria's learning platform for WAEC, JAMB and NECO. Interactive lessons, an AI tutor, smart flashcards, quizzes, CBT practice and a study plan that adapts to you.",
};

export default function LandingPage() {
  return (
    <div className="landing min-h-screen">
      <Nav />
      <main>
        <Hero />
        <TrustedBy />
        <WhyUs />
        <Showcase />
        <Journey />
        <Subjects />
        <DeepDive />
        <Users />
        <Testimonials />
        <StatsBand />
        <Pricing />
        <MobileApp />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
