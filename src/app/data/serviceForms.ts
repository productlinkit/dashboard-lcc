/*
 * Per-service form schemas — faithful encoding of PRD §5–10 field tables.
 * Each service's case-detail form renders from this. Requirement designations
 * (mandatory / conditional / optional) and bilingual Lao labels follow the PRD;
 * Marriage & Divorce field sets are "derived" per PRD §8/§9 and §13 item 2.
 */

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "time"
  | "choice"
  | "lookup"
  | "image"
  | "document"
  | "signature"
  | "auto"
  | "static";

export type Requirement = "mandatory" | "conditional" | "optional";

export interface FieldDef {
  en: string;
  lo: string;
  desc?: string;
  type: FieldType;
  req: Requirement;
}

export interface FormSection {
  title: string;
  laTitle?: string;
  note?: string;
  /** repeatable groups, e.g. Mother/Father, Spouse A/B, household members */
  instances?: string[];
  fields: FieldDef[];
}

export interface ServiceForm {
  serviceId: string;
  source: string;
  sections: FormSection[];
}

/* Common header / jurisdiction block reused by several services. */
const HEADER_BIRTH_DEATH: FormSection = {
  title: "Header",
  laTitle: "ຫົວເລື່ອງ",
  fields: [
    { en: "Province / Capital City", lo: "ແຂວງ/ນະຄອນຫຼວງ", desc: "Administrative jurisdiction at the top of the form.", type: "lookup", req: "mandatory" },
    { en: "District", lo: "ເມືອງ", desc: "District under that province/capital.", type: "lookup", req: "mandatory" },
    { en: "Village", lo: "ບ້ານ", desc: "Village issuing the declaration.", type: "lookup", req: "mandatory" },
    { en: "Document No.", lo: "ເລກທີ.../ປີ...", desc: "Reference/document number (format: number/year).", type: "auto", req: "mandatory" },
    { en: "Dated", lo: "ລົງວັນທີ", desc: "Date the declaration is signed and issued.", type: "date", req: "mandatory" },
    { en: "Legal basis", lo: "ອີງຕາມກົດໝາຍວ່າດ້ວຍຄອບຄົວ", desc: "Pursuant to Family Law No. 44/NA, dated 14/06/2018 (pre-filled).", type: "static", req: "mandatory" },
  ],
};

/* Header for the derived Marriage / Divorce services (PRD §8.2 / §9.2). */
const HEADER_DERIVED: FormSection = {
  title: "Header",
  laTitle: "ຫົວເລື່ອງ",
  note: "Common header / jurisdiction block (all Mandatory).",
  fields: [
    { en: "Province", lo: "ແຂວງ/ນະຄອນຫຼວງ", type: "lookup", req: "mandatory" },
    { en: "District", lo: "ເມືອງ", type: "lookup", req: "mandatory" },
    { en: "Village", lo: "ບ້ານ", type: "lookup", req: "mandatory" },
    { en: "Document No.", lo: "ເລກທີ", type: "auto", req: "mandatory" },
    { en: "Date", lo: "ລົງວັນທີ", type: "date", req: "mandatory" },
  ],
};

const RESIDENCE: ServiceForm = {
  serviceId: "resident",
  source: "Lao PDR Residential Certificate form (27 fields) — PRD §5.2",
  sections: [
    {
      title: "Header & jurisdiction",
      laTitle: "ຫົວເລື່ອງ ແລະ ເຂດປົກຄອງ",
      fields: [
        { en: "Province", lo: "ແຂວງ/ນະຄອນຫຼວງ", desc: "Province where the issuing village office is located.", type: "lookup", req: "mandatory" },
        { en: "District", lo: "ເມືອງ", desc: "District under that province.", type: "lookup", req: "mandatory" },
        { en: "Village's Name", lo: "ຊື່ບ້ານ", desc: "Village whose office issues the certificate.", type: "lookup", req: "mandatory" },
        { en: "Ref. No.", lo: "ເລກທີ", desc: "System-generated reference / document number.", type: "auto", req: "mandatory" },
      ],
    },
    {
      title: "Certifying authority",
      laTitle: "ອຳນາດການຢັ້ງຢືນ",
      fields: [
        { en: "Village Chief's Name", lo: "ນາຍບ້ານ", desc: "Full name of the Village Chief (Nai Ban) who certifies and signs.", type: "text", req: "mandatory" },
        { en: "Certifying District / Province", lo: "ເມືອງ / ແຂວງ (ຂອງນາຍບ້ານ)", desc: "District and province anchoring the certifying authority's jurisdiction.", type: "lookup", req: "mandatory" },
      ],
    },
    {
      title: "Applicant identity",
      laTitle: "ຂໍ້ມູນຜູ້ຍື່ນຄຳຮ້ອງ",
      fields: [
        { en: "Picture", lo: "ຮູບ (ຕິດຮູບ 3x4)", desc: "Applicant's 3×4 cm photograph.", type: "image", req: "conditional" },
        { en: "Citizen's Name", lo: "ຊື່ ແລະ ນາມສະກຸນ (ທ້າວ/ນາງ)", desc: "Full name of the applicant requesting proof of residence.", type: "text", req: "mandatory" },
        { en: "Age", lo: "ອາຍຸ", desc: "Applicant's age at time of application.", type: "number", req: "mandatory" },
        { en: "Occupation", lo: "ອາຊີບ", desc: "Applicant's current occupation or profession.", type: "text", req: "optional" },
        { en: "Nationality", lo: "ສັນຊາດ", desc: "Applicant's nationality (e.g., Lao or foreign).", type: "lookup", req: "mandatory" },
        { en: "Current Village", lo: "ປະຈຸບັນຢູ່ບ້ານ", desc: "Village where the applicant currently resides — the core attested fact.", type: "lookup", req: "mandatory" },
        { en: "Group (Khum)", lo: "ຄຸ້ມ", desc: "Neighbourhood/cluster group within the village.", type: "text", req: "conditional" },
        { en: "Unit (Nuay Ban)", lo: "ໜ່ວຍ", desc: "Village administrative unit under which the residence falls.", type: "text", req: "conditional" },
        { en: "House No.", lo: "ເຮືອນເລກທີ", desc: "House number identifying the specific residence.", type: "text", req: "mandatory" },
      ],
    },
    {
      title: "Household reference (from Family Book)",
      laTitle: "ອ້າງອີງສຳມະໂນຄົວ",
      fields: [
        { en: "Household Census Book No.", lo: "ສຳມະໂນຄົວ ເລກທີ", desc: "Number of the family book in which residency is registered.", type: "text", req: "mandatory" },
        { en: "Date issued (census book)", lo: "ລົງວັນທີ (ສຳມະໂນຄົວ)", desc: "Date the household census book entry was originally issued.", type: "date", req: "conditional" },
        { en: "Census District / Province", lo: "ເມືອງ / ແຂວງ (ສຳມະໂນຄົວ)", desc: "District and province associated with the household census registration.", type: "lookup", req: "conditional" },
      ],
    },
    {
      title: "Parentage",
      laTitle: "ບິດາ ມານດາ",
      fields: [
        { en: "Is the child of Mr.", lo: "ເປັນລູກຂອງທ້າວ", desc: "Full name of the applicant's father.", type: "text", req: "conditional" },
        { en: "Is the child of Mrs.", lo: "ແລະ ນາງ", desc: "Full name of the applicant's mother.", type: "text", req: "conditional" },
        { en: "Native Village / District / Province", lo: "ບ້ານ / ເມືອງ / ແຂວງ (ພູມລຳເນົາ)", desc: "Home village and jurisdiction of the family record (distinct from current residence).", type: "lookup", req: "optional" },
      ],
    },
    {
      title: "Purpose & issuance",
      laTitle: "ຈຸດປະສົງ ແລະ ການອອກໃບ",
      fields: [
        { en: "This certificate is used for", lo: "ໃບຢັ້ງຢືນສະບັບນີ້ໃຊ້ເພື່ອ", desc: "Stated purpose (e.g., school enrolment, bank account, employment).", type: "text", req: "mandatory" },
        { en: "Date / Month / Year (issued)", lo: "ວັນ/ເດືອນ/ປີ (ອອກໃບ)", desc: "Date the Village Chief signs and issues the certificate.", type: "date", req: "mandatory" },
      ],
    },
  ],
};

const BIRTH: ServiceForm = {
  serviceId: "birth",
  source: "Birth Declaration Form (ໃບແຈ້ງເກີດ) under Family Law No. 44/NA — PRD §6",
  sections: [
    HEADER_BIRTH_DEATH,
    {
      title: "Section 1 — The Child",
      laTitle: "ພາກທີ 1 — ເດັກນ້ອຍ",
      fields: [
        { en: "Full Name (Lao / English)", lo: "ຊື່ ແລະ ນາມສະກຸນ (ລາວ/ອັງກິດ)", desc: "Full name of the child in Lao and Roman script.", type: "text", req: "mandatory" },
        { en: "Gender", lo: "ເພດ (ຍິງ/ຊາຍ)", desc: "Female / Male.", type: "choice", req: "mandatory" },
        { en: "Date of Birth", lo: "ວັນ, ເດືອນ, ປີເກີດ", desc: "Day / Month / Year of birth.", type: "date", req: "mandatory" },
        { en: "Weight / Height", lo: "ນ້ຳໜັກ / ລວງສູງ", desc: "Birth weight (kg) and length (cm).", type: "number", req: "optional" },
        { en: "Fingerprint Code", lo: "ລະຫັດພິມລາຍນິ້ວມື", desc: "Biometric fingerprint code.", type: "text", req: "optional" },
        { en: "Blood Type / Group", lo: "ລະຫັດເລືອດ / ໂລຫິດໝູ່", desc: "Blood type and group.", type: "text", req: "optional" },
        { en: "Mode of delivery", lo: "ເກີດດ້ວຍວິທີ (ທຳມະຊາດ/ຜ່າຕັດ)", desc: "Natural delivery / C-section; assisted by (name).", type: "choice", req: "optional" },
        { en: "Type of birth / Birth order", lo: "ປະເພດເກີດ / ເປັນລູກຄົນທີ", desc: "Single / Twins; child number.", type: "choice", req: "mandatory" },
        { en: "Ethnicity / Nationality / Religion", lo: "ເຊື້ອຊາດ / ສັນຊາດ / ສາສະໜາ", desc: "Ethnicity, nationality and religion of the child.", type: "lookup", req: "mandatory" },
        { en: "Place of Birth", lo: "ສະຖານທີ່ເກີດ", desc: "Village, District/City, Province/Capital, Country.", type: "lookup", req: "mandatory" },
        { en: "Current Address", lo: "ທີ່ຢູ່ປັດຈຸບັນ", desc: "House No., Village, District/City, Province/Capital.", type: "lookup", req: "mandatory" },
        { en: "Co-delivered (twin) child", lo: "ຜູ້ຮ່ວມເກີດ (ຝາແຝດ)", desc: "Twin's full name and gender.", type: "text", req: "conditional" },
      ],
    },
    {
      title: "Parents",
      laTitle: "ພາກທີ 2/3 — ມານດາ / ບິດາ",
      note: "Both parent sections share the same structure. Father section is Conditional where the father is unknown or undeclared (sole-parent declaration allowed).",
      instances: ["Mother (ມານດາ)", "Father (ບິດາ)"],
      fields: [
        { en: "Full Name (Lao / English)", lo: "ຊື່ ແລະ ນາມສະກຸນ (ລາວ/ອັງກິດ)", desc: "Parent's full name in Lao and Roman script.", type: "text", req: "mandatory" },
        { en: "Fingerprint Code", lo: "ລະຫັດພິມລາຍນິ້ວມື", desc: "Biometric fingerprint code, if available.", type: "text", req: "optional" },
        { en: "Date of Birth", lo: "ວັນ, ເດືອນ, ປີເກີດ", desc: "Parent's day / month / year of birth.", type: "date", req: "mandatory" },
        { en: "Ethnicity", lo: "ເຊື້ອຊາດ", desc: "Parent's ethnicity.", type: "lookup", req: "mandatory" },
        { en: "Nationality", lo: "ສັນຊາດ", desc: "Parent's nationality.", type: "lookup", req: "mandatory" },
        { en: "Ethnic Group", lo: "ຊົນເຜົ່າ", desc: "Parent's ethnic group.", type: "lookup", req: "optional" },
        { en: "Religion", lo: "ສາສະໜາ", desc: "Parent's religion.", type: "lookup", req: "optional" },
        { en: "Marital Status", lo: "ສະຖານະພາບ (ໂສດ/ແຕ່ງດອງ/ໝ້າຍ/ຢ່າ)", desc: "Single / Married / Widowed / Divorced.", type: "choice", req: "mandatory" },
        { en: "Current Address", lo: "ທີ່ຢູ່ປັດຈຸບັນ", desc: "House No., Village, District/City, Province/Capital, Country.", type: "lookup", req: "mandatory" },
        { en: "Census Book No. / ID Card No.", lo: "ສຳມະໂນຄົວ / ບັດປະຈຳຕົວ ເລກທີ", desc: "One of the two identifiers, plus its issue date.", type: "text", req: "mandatory" },
        { en: "Education Level", lo: "ລະດັບການສຶກສາ", desc: "Parent's education level.", type: "lookup", req: "optional" },
        { en: "Occupation", lo: "ອາຊີບ", desc: "Parent's occupation.", type: "text", req: "optional" },
      ],
    },
    {
      title: "Section 4 — Informant (Reporter of Birth)",
      laTitle: "ພາກທີ 4 — ຜູ້ແຈ້ງ",
      fields: [
        { en: "Full Name (Lao / English)", lo: "ຊື່ ແລະ ນາມສະກຸນ (ລາວ/ອັງກິດ)", desc: "Informant's full name in Lao and Roman script.", type: "text", req: "mandatory" },
        { en: "Fingerprint Code", lo: "ລະຫັດພິມລາຍນິ້ວມື", desc: "Biometric fingerprint code.", type: "text", req: "optional" },
        { en: "Date of Birth", lo: "ວັນ, ເດືອນ, ປີເກີດ", desc: "Informant's date of birth.", type: "date", req: "mandatory" },
        { en: "Ethnicity / Nationality / Ethnic Group / Religion", lo: "ເຊື້ອຊາດ/ສັນຊາດ/ຊົນເຜົ່າ/ສາສະໜາ", desc: "Informant's demographic details.", type: "lookup", req: "optional" },
        { en: "Marital Status", lo: "ສະຖານະພາບ (ໂສດ/ແຕ່ງດອງ/ໝ້າຍ/ຢ່າ)", desc: "Single / Married / Widowed / Divorced.", type: "choice", req: "optional" },
        { en: "Current Address", lo: "ທີ່ຢູ່ປັດຈຸບັນ", desc: "House No., Village, District/City, Province/Capital, Country.", type: "lookup", req: "mandatory" },
        { en: "Census Book No. / ID Card No.", lo: "ສຳມະໂນຄົວ / ບັດປະຈຳຕົວ ເລກທີ", desc: "One identifier plus its issue date.", type: "text", req: "mandatory" },
        { en: "Education Level", lo: "ລະດັບການສຶກສາ", desc: "Informant's education level.", type: "lookup", req: "optional" },
        { en: "Relationship to the Child", lo: "ສາຍພົວພັນກັບລູກ", desc: "How the informant relates to the child.", type: "text", req: "mandatory" },
        { en: "Phone Number", lo: "ເບີໂທລະສັບ", desc: "Contact phone number.", type: "text", req: "mandatory" },
        { en: "Email", lo: "ອິເມວ", desc: "Contact email address.", type: "text", req: "optional" },
      ],
    },
  ],
};

const DEATH: ServiceForm = {
  serviceId: "death",
  source: "Death Declaration Form (ໃບແຈ້ງເສຍຊີວິດ) under Family Law No. 44/NA — PRD §7",
  sections: [
    HEADER_BIRTH_DEATH,
    {
      title: "Section 1 — The Deceased",
      laTitle: "ພາກທີ 1 — ຜູ້ເສຍຊີວິດ",
      fields: [
        { en: "Full Name (Lao / English)", lo: "ຊື່ ແລະ ນາມສະກຸນ (ລາວ/ອັງກິດ)", desc: "Full name of the deceased in Lao and Roman script.", type: "text", req: "mandatory" },
        { en: "Fingerprint Code", lo: "ລະຫັດພິມລາຍນິ້ວມື", desc: "Biometric fingerprint code.", type: "text", req: "optional" },
        { en: "Gender", lo: "ເພດ (ຍິງ/ຊາຍ)", desc: "Female / Male.", type: "choice", req: "mandatory" },
        { en: "Date of Birth", lo: "ວັນ, ເດືອນ, ປີເກີດ", desc: "Deceased's date of birth.", type: "date", req: "mandatory" },
        { en: "Education / Occupation / Workplace", lo: "ລະດັບການສຶກສາ / ອາຊີບ / ສະຖານທີ່ເຮັດວຽກ", desc: "Deceased's education, occupation and workplace.", type: "text", req: "optional" },
        { en: "Ethnicity / Nationality / Ethnic Group / Religion", lo: "ເຊື້ອຊາດ/ສັນຊາດ/ຊົນເຜົ່າ/ສາສະໜາ", desc: "Deceased's demographic details.", type: "lookup", req: "mandatory" },
        { en: "Marital Status", lo: "ສະຖານະພາບ (ໂສດ/ແຕ່ງດອງ/ໝ້າຍ/ຢ່າ)", desc: "Single / Married / Widowed / Divorced.", type: "choice", req: "mandatory" },
        { en: "Current Address", lo: "ທີ່ຢູ່ປັດຈຸບັນ", desc: "House No., Unit, Village, District/City, Province/Capital, Country.", type: "lookup", req: "mandatory" },
        { en: "Census Book No. / ID Card No.", lo: "ສຳມະໂນຄົວ / ບັດປະຈຳຕົວ ເລກທີ", desc: "One identifier plus its issue date.", type: "text", req: "mandatory" },
        { en: "Place of Death", lo: "ສະຖານທີ່ເສຍຊີວິດ", desc: "Village, District/City, Province/Capital, Country.", type: "lookup", req: "mandatory" },
        { en: "Date of Death", lo: "ວັນ, ເດືອນ, ປີເສຍຊີວິດ", desc: "Day / Month / Year of death.", type: "date", req: "mandatory" },
        { en: "Time of Death", lo: "ເວລາເສຍຊີວິດ", desc: "Hours and minutes of death.", type: "time", req: "optional" },
        { en: "Cause of Death", lo: "ສາເຫດການເສຍຊີວິດ", desc: "Illness / Accident / Suicide / Homicide / Other (specify).", type: "choice", req: "mandatory" },
      ],
    },
    {
      title: "Parents of the deceased",
      laTitle: "ພາກທີ 2/3 — ມານດາ / ບິດາ",
      note: "Both parent sections share the same structure. Conditional where the parents are deceased or unknown.",
      instances: ["Mother (ມານດາ)", "Father (ບິດາ)"],
      fields: [
        { en: "Full Name (Lao / English)", lo: "ຊື່ ແລະ ນາມສະກຸນ (ລາວ/ອັງກິດ)", desc: "Parent's full name in Lao and Roman script.", type: "text", req: "mandatory" },
        { en: "Fingerprint Code", lo: "ລະຫັດພິມລາຍນິ້ວມື", desc: "Biometric fingerprint code, if available.", type: "text", req: "optional" },
        { en: "Date of Birth", lo: "ວັນ, ເດືອນ, ປີເກີດ", desc: "Parent's date of birth.", type: "date", req: "optional" },
        { en: "Ethnicity / Nationality / Ethnic Group / Religion", lo: "ເຊື້ອຊາດ/ສັນຊາດ/ຊົນເຜົ່າ/ສາສະໜາ", desc: "Parent's demographic details.", type: "lookup", req: "optional" },
        { en: "Marital Status", lo: "ສະຖານະພາບ (ໂສດ/ແຕ່ງດອງ/ໝ້າຍ/ຢ່າ)", desc: "Single / Married / Widowed / Divorced.", type: "choice", req: "optional" },
        { en: "Current Address", lo: "ທີ່ຢູ່ປັດຈຸບັນ", desc: "House No., Village, District/City, Province/Capital, Country.", type: "lookup", req: "conditional" },
        { en: "Census Book No. / ID Card No.", lo: "ສຳມະໂນຄົວ / ບັດປະຈຳຕົວ ເລກທີ", desc: "One identifier plus its issue date.", type: "text", req: "conditional" },
        { en: "Education / Occupation / Workplace", lo: "ລະດັບການສຶກສາ / ອາຊີບ / ສະຖານທີ່ເຮັດວຽກ", desc: "Parent's education, occupation and workplace.", type: "text", req: "optional" },
      ],
    },
    {
      title: "Section 4 — Informant (Reporter of Death)",
      laTitle: "ພາກທີ 4 — ຜູ້ແຈ້ງ",
      fields: [
        { en: "Full Name (Lao / English)", lo: "ຊື່ ແລະ ນາມສະກຸນ (ລາວ/ອັງກິດ)", desc: "Informant's full name in Lao and Roman script.", type: "text", req: "mandatory" },
        { en: "Fingerprint Code", lo: "ລະຫັດພິມລາຍນິ້ວມື", desc: "Biometric fingerprint code.", type: "text", req: "optional" },
        { en: "Date of Birth", lo: "ວັນ, ເດືອນ, ປີເກີດ", desc: "Informant's date of birth.", type: "date", req: "mandatory" },
        { en: "Ethnicity / Nationality / Ethnic Group / Religion", lo: "ເຊື້ອຊາດ/ສັນຊາດ/ຊົນເຜົ່າ/ສາສະໜາ", desc: "Informant's demographic details.", type: "lookup", req: "optional" },
        { en: "Marital Status", lo: "ສະຖານະພາບ (ໂສດ/ແຕ່ງດອງ/ໝ້າຍ/ຢ່າ)", desc: "Single / Married / Widowed / Divorced.", type: "choice", req: "optional" },
        { en: "Current Address", lo: "ທີ່ຢູ່ປັດຈຸບັນ", desc: "House No., Village, District/City, Province/Capital, Country.", type: "lookup", req: "mandatory" },
        { en: "Census Book No. / ID Card No.", lo: "ສຳມະໂນຄົວ / ບັດປະຈຳຕົວ ເລກທີ", desc: "One identifier plus its issue date.", type: "text", req: "mandatory" },
        { en: "Education Level", lo: "ລະດັບການສຶກສາ", desc: "Informant's education level.", type: "lookup", req: "optional" },
        { en: "Relationship to the Deceased", lo: "ສາຍພົວພັນກັບຜູ້ເສຍຊີວິດ", desc: "How the informant relates to the deceased.", type: "text", req: "mandatory" },
        { en: "Phone Number", lo: "ເບີໂທລະສັບ", desc: "Contact phone number.", type: "text", req: "mandatory" },
        { en: "Email", lo: "ອິເມວ", desc: "Contact email address.", type: "text", req: "optional" },
      ],
    },
  ],
};

const MARRIAGE: ServiceForm = {
  serviceId: "marriage",
  source: "Derived from statutory requirements & form patterns — PRD §8 (validate against official form)",
  sections: [
    HEADER_DERIVED,
    {
      title: "Spouse details",
      laTitle: "ຂໍ້ມູນຄູ່ສົມລົດ",
      note: "Captured once per spouse.",
      instances: ["Spouse A", "Spouse B"],
      fields: [
        { en: "Full Name (Lao / English)", lo: "ຊື່ ແລະ ນາມສະກຸນ (ລາວ/ອັງກິດ)", desc: "Spouse's full name in Lao and Roman script.", type: "text", req: "mandatory" },
        { en: "Date of Birth", lo: "ວັນ, ເດືອນ, ປີເກີດ", desc: "Spouse's date of birth.", type: "date", req: "mandatory" },
        { en: "Gender", lo: "ເພດ (ຍິງ/ຊາຍ)", desc: "Female / Male.", type: "choice", req: "mandatory" },
        { en: "Nationality", lo: "ສັນຊາດ", desc: "Spouse's nationality (drives the foreign-spouse path).", type: "lookup", req: "mandatory" },
        { en: "Ethnicity / Ethnic Group / Religion", lo: "ເຊື້ອຊາດ / ຊົນເຜົ່າ / ສາສະໜາ", desc: "Spouse's demographic details.", type: "lookup", req: "optional" },
        { en: "Occupation", lo: "ອາຊີບ", desc: "Spouse's occupation (from CV).", type: "text", req: "optional" },
        { en: "ID Card / Passport No.", lo: "ບັດປະຈຳຕົວ / ໜັງສືຜ່ານແດນ ເລກທີ", desc: "National ID for Lao nationals; passport for foreigners.", type: "text", req: "mandatory" },
        { en: "Current Address", lo: "ທີ່ຢູ່ປັດຈຸບັນ", desc: "House No., Village, District/City, Province/Capital, Country.", type: "lookup", req: "mandatory" },
        { en: "Residence Certificate Ref.", lo: "ເລກທີໃບຢັ້ງຢືນທີ່ຢູ່", desc: "Reference to each spouse's residence certificate.", type: "lookup", req: "mandatory" },
        { en: "Single-status certificate", lo: "ໃບຢັ້ງຢືນສະຖານະໂສດ", desc: "Proof of single status for each spouse.", type: "document", req: "mandatory" },
        { en: "Medical certificate", lo: "ໃບຢັ້ງຢືນສຸຂະພາບ", desc: "Medical certificate for the couple.", type: "document", req: "mandatory" },
        { en: "Minute of engagement", lo: "ບົດບັນທຶກການໝັ້ນໝາຍ", desc: "Engagement minute supporting the application.", type: "document", req: "mandatory" },
        { en: "Prior marital-status proof", lo: "ຫຼັກຖານສະຖານະການແຕ່ງງານກ່ອນ", desc: "Divorce or widowhood proof if previously married.", type: "document", req: "conditional" },
        { en: "Foreign-spouse documents", lo: "ເອກະສານຄູ່ສົມລົດຕ່າງປະເທດ", desc: "Documents required under Decree 198/PM & Notice 1144.", type: "document", req: "conditional" },
      ],
    },
    {
      title: "Registration",
      laTitle: "ການຈົດທະບຽນ",
      fields: [
        { en: "Date of Marriage", lo: "ວັນແຕ່ງດອງ", desc: "Date the marriage is registered.", type: "date", req: "mandatory" },
        { en: "Place of Registration", lo: "ສະຖານທີ່ຈົດທະບຽນ", desc: "DoHA office where registration takes place.", type: "lookup", req: "mandatory" },
        { en: "Witness 1 / 2 / 3 — Name & ID", lo: "ພະຍານ 1/2/3 — ຊື່ ແລະ ເລກບັດ", desc: "Names and identification of the three required witnesses.", type: "text", req: "mandatory" },
        { en: "Couple signatures", lo: "ລາຍເຊັນຄູ່ສົມລົດ", desc: "E-signatures of both spouses.", type: "signature", req: "mandatory" },
        { en: "Registrar e-signature", lo: "ລາຍເຊັນເອເລັກໂຕຣນິກນາຍທະບຽນ", desc: "DoHA registrar's protected e-signature.", type: "signature", req: "mandatory" },
      ],
    },
  ],
};

const DIVORCE: ServiceForm = {
  serviceId: "divorce",
  source: "Derived from statutory requirements & form patterns — PRD §9 (validate against official form)",
  sections: [
    HEADER_DERIVED,
    {
      title: "Spouse details",
      laTitle: "ຂໍ້ມູນຄູ່ສົມລົດ",
      note: "Captured once per spouse.",
      instances: ["Husband", "Wife"],
      fields: [
        { en: "Full Name (Lao / English)", lo: "ຊື່ ແລະ ນາມສະກຸນ (ລາວ/ອັງກິດ)", desc: "Spouse's full name in Lao and Roman script.", type: "text", req: "mandatory" },
        { en: "Date of Birth", lo: "ວັນ, ເດືອນ, ປີເກີດ", desc: "Spouse's date of birth.", type: "date", req: "mandatory" },
        { en: "Nationality", lo: "ສັນຊາດ", desc: "Spouse's nationality.", type: "lookup", req: "mandatory" },
        { en: "ID Card / Passport No.", lo: "ບັດປະຈຳຕົວ / ໜັງສືຜ່ານແດນ ເລກທີ", desc: "National ID for Lao nationals; passport for foreigners.", type: "text", req: "mandatory" },
        { en: "Current Address", lo: "ທີ່ຢູ່ປັດຈຸບັນ", desc: "House No., Village, District/City, Province/Capital, Country.", type: "lookup", req: "mandatory" },
        { en: "Existing Marriage Certificate Ref.", lo: "ເລກທີໃບຢັ້ງຢືນການແຕ່ງດອງ", desc: "Reference to the marriage being dissolved.", type: "lookup", req: "mandatory" },
      ],
    },
    {
      title: "Divorce basis & registration",
      laTitle: "ພື້ນຖານ ແລະ ການຈົດທະບຽນ",
      fields: [
        { en: "Divorce type", lo: "ປະເພດການຢ່າຮ້າງ", desc: "Voluntary (village minute) or Contested (court decision).", type: "choice", req: "mandatory" },
        { en: "Minute of divorce (Village Chief)", lo: "ບົດບັນທຶກການຢ່າຮ້າງ (ນາຍບ້ານ)", desc: "Village minute for a voluntary divorce.", type: "document", req: "conditional" },
        { en: "Court decision", lo: "ຄຳຕັດສິນຂອງສານ", desc: "Final People's Court decision for a contested divorce.", type: "document", req: "conditional" },
        { en: "Date of Divorce", lo: "ວັນຢ່າຮ້າງ", desc: "Date the divorce is registered.", type: "date", req: "mandatory" },
        { en: "Place of Registration", lo: "ສະຖານທີ່ຈົດທະບຽນ", desc: "DoHA office where registration takes place.", type: "lookup", req: "mandatory" },
        { en: "Children / custody reference", lo: "ການລ້ຽງດູບຸດ", desc: "Reference to custody or dependent arrangements, if recorded.", type: "text", req: "optional" },
        { en: "Registrar e-signature", lo: "ລາຍເຊັນເອເລັກໂຕຣນິກນາຍທະບຽນ", desc: "DoHA registrar's protected e-signature.", type: "signature", req: "mandatory" },
        { en: "Certificate to each spouse", lo: "ໃບຢັ້ງຢືນໃຫ້ແຕ່ລະຝ່າຍ", desc: "A separate divorce certificate issued to each spouse.", type: "auto", req: "mandatory" },
      ],
    },
  ],
};

const FAMILY_BOOK: ServiceForm = {
  serviceId: "family-book",
  source: "Family Book pages referenced by the Residential Certificate (23 fields) — PRD §10",
  sections: [
    {
      title: "Cover & Household Head",
      laTitle: "ໜ້າປົກ ແລະ ເຈົ້າຂອງເຮືອນ",
      fields: [
        { en: "Holder's Name (Book Cover)", lo: "ຊື່ເຈົ້າຂອງປຶ້ມ", desc: "Full name of the household head on the front cover.", type: "text", req: "mandatory" },
        { en: "Family Book No.", lo: "ປຶ້ມສຳມະໂນຄົວ ເລກທີ", desc: "Official registration number assigned by DoPS.", type: "auto", req: "mandatory" },
        { en: "Holder's Name and Surname", lo: "ຊື່ ແລະ ນາມສະກຸນ ເຈົ້າຂອງ", desc: "Full first name and surname of the household head (owner page).", type: "text", req: "mandatory" },
        { en: "ID Card No.", lo: "ບັດປະຈຳຕົວ ເລກທີ", desc: "National ID number of the household head.", type: "text", req: "mandatory" },
        { en: "Place of Birth", lo: "ສະຖານທີ່ເກີດ", desc: "Town/village where the household head was born.", type: "lookup", req: "mandatory" },
        { en: "Unit", lo: "ໜ່ວຍ", desc: "Village administrative unit number for the household.", type: "text", req: "mandatory" },
        { en: "Group", lo: "ກຸ່ມ", desc: "Neighbourhood/cluster group number within the village.", type: "text", req: "mandatory" },
        { en: "Village / District / Province", lo: "ບ້ານ / ເມືອງ / ແຂວງ", desc: "Location where the household currently resides.", type: "lookup", req: "mandatory" },
        { en: "Total people in household", lo: "ຈຳນວນຄົນໃນຄອບຄົວ", desc: "Overall headcount of registered members.", type: "number", req: "mandatory" },
        { en: "Number of Men / Women", lo: "ຈຳນວນຊາຍ / ຍິງ", desc: "Count of male and female members.", type: "number", req: "mandatory" },
        { en: "Date of Issue", lo: "ວັນທີອອກ", desc: "Date the family book was issued, stamped and signed by the Village Chief.", type: "date", req: "mandatory" },
      ],
    },
    {
      title: "Household Members (per member)",
      laTitle: "ສະມາຊິກໃນຄອບຄົວ",
      note: "Repeated once per household member.",
      fields: [
        { en: "Picture", lo: "ຮູບ (ຕິດຮູບ 3x4)", desc: "Photograph of the member for identity verification.", type: "image", req: "optional" },
        { en: "Name and Surname", lo: "ຊື່ ແລະ ນາມສະກຸນ", desc: "Full name of the household member.", type: "text", req: "mandatory" },
        { en: "Gender", lo: "ເພດ (ຍິງ/ຊາຍ)", desc: "Male / Female.", type: "choice", req: "mandatory" },
        { en: "Date of Birth", lo: "ວັນ, ເດືອນ, ປີເກີດ", desc: "Member's day / month / year of birth.", type: "date", req: "mandatory" },
        { en: "Relationship to Household Head", lo: "ສາຍພົວພັນກັບເຈົ້າຂອງເຮືອນ", desc: "How the member relates to the head (spouse, child, parent, etc.).", type: "choice", req: "mandatory" },
        { en: "Ethnicity", lo: "ເຊື້ອຊາດ", desc: "Ethnic origin of the member.", type: "lookup", req: "optional" },
        { en: "Nationality", lo: "ສັນຊາດ", desc: "Legal nationality/citizenship of the member.", type: "lookup", req: "mandatory" },
        { en: "UIN", lo: "ເລກປະຈຳຕົວ (UIN)", desc: "Unique identification number linking the member to the population register.", type: "auto", req: "mandatory" },
      ],
    },
  ],
};

export const SERVICE_FORMS: Record<string, ServiceForm> = {
  resident: RESIDENCE,
  birth: BIRTH,
  death: DEATH,
  marriage: MARRIAGE,
  divorce: DIVORCE,
  "family-book": FAMILY_BOOK,
};

export const REQUIREMENT_META: Record<Requirement, { label: string; color: string; bg: string }> = {
  mandatory: { label: "Mandatory", color: "#B91C1C", bg: "#FEE2E2" },
  conditional: { label: "Conditional", color: "#B45309", bg: "#FEF3C7" },
  optional: { label: "Optional", color: "#047857", bg: "#D1FAE5" },
};
