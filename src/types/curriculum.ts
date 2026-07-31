import type {
  Subject,
  Topic,
  Subtopic,
  Lesson,
  CurriculumLevel,
} from "./prisma";

// Subject with its topic tree
export type SubjectWithTopics = Subject & {
  topics: TopicWithSubtopics[];
  curriculumLevels: CurriculumLevel[];
};

// Topic with nested subtopics and lessons
export type TopicWithSubtopics = Topic & {
  subtopics: SubtopicWithLessons[];
  curriculumLevel: CurriculumLevel;
};

// Subtopic with its lessons
export type SubtopicWithLessons = Subtopic & {
  lessons: Lesson[];
};

// Topic with progress info for a student
export type TopicWithProgress = Topic & {
  curriculumLevel: CurriculumLevel;
  isCompleted: boolean;
  isLocked: boolean;
  accuracy: number | null;
  questionsAttempted: number;
};

// Lesson with its content and student state
export type LessonWithState = Lesson & {
  subtopic: Subtopic & {
    topic: Topic;
  };
  isCompleted: boolean;
  timeSpent: number;
};

// Curriculum structure for a subject at a given level
export type CurriculumMap = {
  subject: Subject;
  levels: {
    classLevel: "SS1" | "SS2" | "SS3";
    terms: {
      term: "FIRST" | "SECOND" | "THIRD";
      topics: TopicWithProgress[];
    }[];
  }[];
};
