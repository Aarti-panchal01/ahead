import Link from "next/link";
import styles from "./landing.module.css";

const STEPS = [
  { number: "01", title: "Start with your photo", detail: "Your own face becomes the reference for every preview." },
  { number: "02", title: "Compare the looks", detail: "Explore wigs and wraps on you, then keep the options you like." },
  { number: "03", title: "Take a fitting brief", detail: "Bring your shortlist and the right questions to a specialist." },
];

export default function Landing() {
  return (
    <main className={styles.landing}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.story}>
          <p className={styles.kicker}>A personal try-on for treatment-related hair loss</p>
          <h1 id="hero-title" className={styles.headline}>
            See your next look, <em>on you.</em>
          </h1>
          <p className={styles.lede}>
            A wig or wrap looks different when it is your face in the mirror. Explore styles on your own photo, compare the looks you like, and bring a shortlist to a fitting with a specialist.
          </p>

          <div className={styles.actions}>
            <Link href="/start" className="btn btn-primary">Start with my photo</Link>
            <Link href="/results?person=P3&stage=gone" className="btn btn-quiet">Explore sample previews</Link>
          </div>
          <p className={styles.sampleNote}>No upload or live API units needed to explore the sample lookbook.</p>

        </div>

        <section className={styles.fittingPanel} aria-labelledby="fitting-panel-title">
          <div className={styles.panelTop}>
            <span className={styles.panelEyebrow}>Ahead · the fitting journey</span>
          </div>
          <p id="fitting-panel-title" className={styles.panelLead}>Make the first fitting conversation easier.</p>
          <ol className={styles.panelSteps}>
            <li>
              <span>01</span>
              <div><strong>Your photo</strong><p>Begin with the face you know.</p></div>
            </li>
            <li>
              <span>02</span>
              <div><strong>Wigs and wraps</strong><p>See each style on your own photo.</p></div>
            </li>
            <li>
              <span>03</span>
              <div><strong>Your fitting brief</strong><p>Save the looks and questions that matter.</p></div>
            </li>
          </ol>
          <p className={styles.panelFoot}>Powered by YouCam Hair Transfer. Built for the conversation with your specialist.</p>
        </section>
      </section>

      <section className={styles.path} aria-labelledby="path-title">
        <div className={styles.pathHead}>
          <p className={styles.sectionLabel}>From first preview to a fitting</p>
          <h2 id="path-title">A shortlist a specialist can act on.</h2>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((step) => (
            <li className={styles.step} key={step.number}>
              <span className={styles.stepNumber}>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </li>
          ))}
        </ol>
        <div className={styles.pathFoot}>
          <p>Previews help you explore style and colour. A specialist can confirm fit, comfort, price and what is available.</p>
          <Link href="/how-we-tested">How previews are made <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <section className={styles.why} aria-labelledby="why-title">
        <div className={styles.whyStory}>
          <p className={styles.sectionLabel}>Why this experience matters</p>
          <h2 id="why-title">The choice is personal. The preview should be, too.</h2>
          <p>Catalogues show a style on someone else. Ahead lets people explore a direction on their own photo, then carry that conversation into a real fitting.</p>
          <a href="https://pubmed.ncbi.nlm.nih.gov/39891884/" target="_blank" rel="noreferrer">Read the patient survey <span aria-hidden="true">↗</span></a>
        </div>
        <div className={styles.evidence}>
          <strong>78%</strong>
          <p>of the 202 people who responded to one cancer-treatment appearance-care survey reported hair loss.</p>
          <small>Among those respondents, 109 of 157 purchased wigs. One survey; not a population-wide estimate.</small>
        </div>
      </section>
    </main>
  );
}
