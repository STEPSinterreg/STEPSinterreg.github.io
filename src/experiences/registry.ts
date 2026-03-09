export type Experience = {
  id: string;
  /** translation key for the title, e.g. `hearing_title` */
  titleKey: string;
  /** translation key for the description, e.g. `hearing_desc` */
  descriptionKey: string;
  /** public asset path, e.g. `/icons/hearingAidWhite2.png` */
  iconSrc?: string;
  route: string;
  status?: "prototype" | "beta" | "live";
};

export const experiences: Experience[] = [
  {
    id: "hearing-loss",
    titleKey: "hearing_title",
    descriptionKey: "hearing_desc",
    iconSrc: "/icons/hearingAidWhite2.png",
    route: "/experiences/hearing-loss",
    status: "prototype",
  },
];
