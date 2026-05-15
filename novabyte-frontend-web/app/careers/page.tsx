import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Careers And Partners",
  description: "Careers and partner opportunities at NovaByte Technologies for developers, designers, support operators, and digital service partners."
};

export default function CareersPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Careers & Partners" title="Work with NovaByte Technologies as the team and service network grows." description="We are open to future collaboration with developers, designers, support operators, content specialists, and digital service partners." />
        <section className="shell section">
          <div className="billingLayout">
            <article className="panel infoPanel">
              <h2 className="sectionTitle">Current Status</h2>
              <p>We are not hiring for a fixed full-time role right now, but interested collaborators can share their profile for future project-based work.</p>
            </article>
            <article className="panel infoPanel">
              <h2 className="sectionTitle">Send Profile</h2>
              <p>Email your skills, work samples, city, availability, and expected project type.</p>
              <a className="button buttonPrimary fullButton" href="mailto:novabytetechnoai@gmail.com?subject=Career%20Or%20Partner%20Profile">
                Email Profile
              </a>
            </article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
