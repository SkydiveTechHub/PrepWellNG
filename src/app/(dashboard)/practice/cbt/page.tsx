import Link from "next/link";
import { LuMonitor, LuArrowRight, LuBookOpen } from "react-icons/lu";

const jambSubjects = [
  { name: "English Language", slug: "english-language", code: "ENG" },
  { name: "Mathematics", slug: "mathematics", code: "MTH" },
  { name: "Physics", slug: "physics", code: "PHY" },
  { name: "Chemistry", slug: "chemistry", code: "CHM" },
  { name: "Biology", slug: "biology", code: "BIO" },
  { name: "Economics", slug: "economics", code: "ECO" },
  { name: "Commerce", slug: "commerce", code: "COM" },
  { name: "Government", slug: "government", code: "GOV" },
  { name: "Literature in English", slug: "literature-in-english", code: "LIT" },
  { name: "Geography", slug: "geography", code: "GEO" },
  { name: "Christian Religious Studies", slug: "christian-religious-studies", code: "CRS" },
  { name: "Islamic Studies", slug: "islamic-studies", code: "IRS" },
];

export default function CBTPracticePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">JAMB CBT Practice</h1>
        <p className="text-muted mt-1">
          Practice JAMB Computer-Based Test questions. Pick a subject to start practicing.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-8">
        <div className="flex items-start gap-3">
          <LuMonitor className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-blue-800">
              Full JAMB CBT simulation
            </h3>
            <p className="text-sm text-blue-700 mt-1">
              Take a complete JAMB CBT mock exam — 180 questions across 4 subjects with
              the official JAMB interface.
            </p>
            <Link
              href="/practice/mock-exam/session?examType=JAMB"
              className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <LuMonitor className="w-4 h-4" />
              Start Full CBT Simulation
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Choose a JAMB subject
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {jambSubjects.map((subject) => (
            <Link
              key={subject.code}
              href={`/practice/past-questions/${subject.slug}?exam=JAMB`}
              className="flex items-center justify-between bg-card rounded-xl border border-border p-4 hover:shadow-md hover:border-primary/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
                  {subject.code}
                </span>
                <span className="font-medium text-foreground text-sm">
                  {subject.name}
                </span>
              </div>
              <LuArrowRight className="w-4 h-4 text-muted group-hover:text-primary transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-3">
          <LuBookOpen className="w-5 h-5 text-muted mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">How it works</h3>
            <ul className="text-sm text-muted mt-2 space-y-1.5">
              <li>• Each subject gives you 40 randomly selected JAMB questions</li>
              <li>• You have 60 minutes to complete each subject</li>
              <li>• Questions are timed and auto-submit when time runs out</li>
              <li>• Review detailed explanations and topic breakdowns after each attempt</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
