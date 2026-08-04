from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = Path(__file__).resolve().parents[1] / "output" / "pdf" / "Dentistry_Study_Reference.pdf"

pdfmetrics.registerFont(TTFont("StudySans", "/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("StudySans-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))

SECTIONS = [
    (
        "Periodontology",
        "Master Dentistry source pages 15-74",
        [
            ("Healthy sulcus", "A healthy gingival sulcus is typically 0.5-3.0 mm deep. Source PDF p.15."),
            ("Biologic width", "The epithelial and connective-tissue attachment is about 2 mm; restorative margins should respect this attachment. Source PDF pp.16 and 60."),
            ("Periodontal pocket", "A true pocket includes attachment loss. A false pocket is caused by gingival enlargement without attachment loss. Source PDF p.26."),
            ("Furcation involvement", "Class I furcation involvement is an initial lesion extending no more than 3 mm horizontally. Source PDF p.22."),
            ("Aggressive periodontitis", "Key features include rapid attachment loss, rapid bone destruction, and familial aggregation. Source PDF p.28."),
            ("Scaling and root planing", "SRP removes plaque, calculus, and contaminated or necrotic cementum from root surfaces. Source PDF pp.15 and 55."),
        ],
    ),
    (
        "Endodontics and Restorative Dentistry",
        "Master Dentistry source pages 75-134",
        [
            ("Reversible pulpitis", "Pain stops soon after the stimulus is removed. Lingering or spontaneous pain is more consistent with irreversible pulpitis. Source PDF p.76."),
            ("Root canal access", "Straight-line access reduces instrument bending and helps instruments reach the apical portion of the canal. Source PDF pp.82-84."),
            ("Sodium hypochlorite", "NaOCl is used as an irrigant for its antimicrobial and tissue-dissolving properties. Source PDF p.84."),
            ("Patency file", "A small file can help prevent apical blockage and maintain canal patency. Source PDF p.85."),
            ("MTA", "Mineral trioxide aggregate is used for repair procedures and root-end filling. Source PDF p.99."),
            ("Glass-ionomer cement", "Glass ionomer is moisture-sensitive during setting and also vulnerable to desiccation, so the surface must be protected. Source PDF p.117."),
            ("Fissure sealant", "Sealants protect susceptible pits and fissures when radiographic dentinal caries is absent. Source PDF pp.187-188."),
        ],
    ),
    (
        "Prosthodontics and Sedation",
        "Master Dentistry source pages 135-178",
        [
            ("Kennedy Class I", "Bilateral posterior edentulous areas create bilateral free-end saddles. Source PDF p.147."),
            ("Kennedy Class III", "A unilateral edentulous area bounded by teeth anteriorly and posteriorly is Class III. Source PDF p.147."),
            ("Overdenture", "An overdenture covers and gains support from retained teeth, roots, or implants. Source PDF pp.146-147."),
            ("Altered cast", "The altered cast technique compensates for the different support provided by abutment teeth and mucosa in distal-extension cases. Source PDF p.151."),
            ("Inhalation sedation", "Nitrous oxide with oxygen provides rapid-onset conscious sedation while the patient remains responsive. Source PDF p.166."),
            ("Flumazenil", "Flumazenil is a benzodiazepine antagonist used as a reversal agent. Source PDF pp.164-165."),
        ],
    ),
    (
        "Pediatric Dentistry and Trauma",
        "Master Dentistry source pages 179-236",
        [
            ("Pulpotomy", "A pulpotomy removes inflamed coronal pulp while preserving radicular pulp tissue. Source PDF p.197."),
            ("Pulpectomy", "A pulpectomy removes both coronal and radicular pulp tissue before obturation. Source PDF p.199."),
            ("Apexification", "Apexification creates an apical hard-tissue barrier in an immature non-vital tooth. Source PDF pp.200-201."),
            ("Avulsed primary tooth", "Replantation is generally not recommended because of the risk to the permanent successor. Source PDF pp.212-214."),
            ("Subluxation", "Subluxation is loosening of a tooth without displacement. Source PDF p.210."),
            ("Dens invaginatus", "This developmental invagination commonly affects maxillary lateral incisors and may create a pathway for pulpal infection. Source PDF p.219."),
            ("Turner tooth", "Localized enamel hypoplasia in a permanent tooth can follow trauma or infection of its primary predecessor. Source PDF p.206."),
        ],
    ),
    (
        "Orthodontics",
        "Master Dentistry source pages 237-334",
        [
            ("Normal overjet", "The reference gives a normal overjet range of approximately 2-4 mm. Source PDF p.242."),
            ("IOTN", "The Index of Orthodontic Treatment Need includes a dental health component and an aesthetic component. Source PDF pp.243-244."),
            ("ANB", "ANB equals SNA minus SNB; the reference describes Class I as approximately 2-4 degrees. Source PDF pp.253-254."),
            ("Class II division 1", "This pattern commonly includes an increased overjet. Source PDF p.280."),
            ("Functional appliance", "Growth-modifying functional appliances are generally timed around the late mixed dentition when growth remains. Source PDF pp.259 and 318."),
            ("Retention", "The reference suggests about six months after removable-appliance treatment and at least one year after fixed-appliance treatment. Source PDF pp.259 and 321."),
        ],
    ),
    (
        "Biostatistics",
        "Dental Pulse source pages 4-22",
        [
            ("Standard error", "The standard error of the mean is SD divided by the square root of the sample size. Source PDF p.5."),
            ("Normal distribution", "In a symmetric normal distribution, mean, median, and mode are equal. About 95% of observations fall within two standard deviations. Source PDF pp.5 and 15."),
            ("Chi-square", "Chi-square is used to test association or differences between proportions in qualitative data. Source PDF pp.4-5."),
            ("Student t-test", "A paired t-test compares before-and-after measurements in the same group; an independent t-test compares separate groups. Source PDF pp.4-5."),
            ("ANOVA", "One-way ANOVA compares the means of three or more groups. Source PDF p.5."),
            ("Type II error", "A Type II error occurs when a false null hypothesis is not rejected. Source PDF pp.4-5."),
            ("Sensitivity and specificity", "Sensitivity identifies true positives; specificity identifies true negatives. Source PDF p.5."),
        ],
    ),
    (
        "Epidemiology and Oral Health Indices",
        "Dental Pulse source pages 23-59",
        [
            ("Incidence", "Incidence counts new cases arising in a defined population over a period of time. Source PDF p.23."),
            ("Prevalence", "Prevalence describes the proportion of a population affected at a point or during a period. Source PDF p.23."),
            ("Case-control study", "A case-control study looks backward from disease status and commonly estimates association with an odds ratio. Source PDF pp.23 and 31."),
            ("Cohort study", "A cohort study follows exposed and unexposed groups over time and can directly calculate relative risk. Source PDF pp.21 and 23."),
            ("DMFT", "DMFT summarizes decayed, missing due to caries, and filled permanent teeth. Source PDF pp.44-46."),
            ("CPITN/CPI", "The periodontal index uses a WHO probe to record bleeding, calculus, and periodontal pockets. Source PDF pp.45-46."),
            ("OHI-S", "The Simplified Oral Hygiene Index measures oral debris and calculus. Source PDF pp.44-45."),
        ],
    ),
    (
        "Prevention, Fluoride, and Caries Activity",
        "Dental Pulse source pages 60-87",
        [
            ("Fluoride dentifrice", "The reference identifies approximately 1000 ppm fluoride as a common dentifrice concentration. Source PDF p.60."),
            ("Topical fluoride rinses", "Examples include 0.05% sodium fluoride daily or 0.2% weekly. Source PDF p.61."),
            ("Vipeholm study", "The Vipeholm study examined the relationship between sugar consistency/frequency and dental caries. Source PDF pp.64 and 74."),
            ("Turku sugar study", "The Turku study examined sugar substitutes, including xylitol, and caries. Source PDF p.74."),
            ("Snyder test", "The Snyder test is a colorimetric caries-activity test based on acid production. Source PDF pp.85-86."),
            ("Lactobacillus count", "The reference identifies this as useful for field studies and sensitive to changes in diet. Source PDF pp.85-86."),
            ("Chlorhexidine", "The supplied study notes identify chlorhexidine as a reference antiplaque agent. Verify current concentration and indication before clinical use."),
        ],
    ),
    (
        "Clinical Records and Study Map",
        "Source map for the supplied Downloads files",
        [
            ("SOAP", "SOAP stands for Subjective, Objective, Assessment, and Plan. Dental Pulse source PDF p.92."),
            ("Master Dentistry self-assessment", "Question/answer pairs begin at PDF pp.54/58, 102/105, 128/130, 153/155, 174/176, 203/205, 231/233, 263/266, 297/302, 325/328, and 354/358."),
            ("Dental Pulse question bank", "Biostatistics pp.4-22; Epidemiology pp.23-43; Indices pp.44-59; Preventive Dentistry pp.60-84; Caries Activity Tests pp.85-87; remaining public-health topics pp.88-164."),
            ("Use", "This PDF is a study aid derived from the supplied glossaries. It is not a substitute for current clinical protocols, faculty instruction, or the original source books."),
        ],
    ),
]


def draw_page(canvas, document):
    canvas.saveState()
    width, height = letter
    canvas.setFillColor(colors.HexColor("#174b6d"))
    canvas.rect(0, height - 0.18 * inch, width, 0.18 * inch, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#5e6974"))
    canvas.setFont("StudySans", 8)
    canvas.drawString(0.68 * inch, 0.42 * inch, "Rauny Ramirez - Dentistry Study Reference")
    canvas.drawRightString(width - 0.68 * inch, 0.42 * inch, f"Page {document.page}")
    canvas.restoreState()


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "Title",
        parent=styles["Title"],
        fontName="StudySans-Bold",
        fontSize=30,
        leading=34,
        textColor=colors.HexColor("#111820"),
        alignment=TA_CENTER,
        spaceAfter=18,
    )
    subtitle = ParagraphStyle(
        "Subtitle",
        parent=styles["BodyText"],
        fontSize=11,
        leading=17,
        textColor=colors.HexColor("#5e6974"),
        alignment=TA_CENTER,
    )
    heading = ParagraphStyle(
        "Heading",
        parent=styles["Heading1"],
        fontName="StudySans-Bold",
        fontSize=22,
        leading=25,
        textColor=colors.HexColor("#174b6d"),
        spaceAfter=5,
    )
    source = ParagraphStyle(
        "Source",
        parent=styles["BodyText"],
        fontName="StudySans-Bold",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#5e6974"),
        spaceAfter=16,
    )
    term = ParagraphStyle(
        "Term",
        parent=styles["BodyText"],
        fontName="StudySans-Bold",
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#111820"),
    )
    definition = ParagraphStyle(
        "Definition",
        parent=styles["BodyText"],
        fontSize=9.2,
        leading=13,
        textColor=colors.HexColor("#333e48"),
    )

    story = [
        Spacer(1, 1.45 * inch),
        Paragraph("Dentistry<br/>Study Reference", title),
        Paragraph("Quiz concepts and source-page map", subtitle),
        Spacer(1, 0.35 * inch),
        Table(
            [["Study", "Quiz 10", "Test 25"], ["Review concepts", "Short practice", "Full mixed test"]],
            colWidths=[1.6 * inch] * 3,
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#174b6d")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "StudySans-Bold"),
                ("FONTNAME", (0, 1), (-1, 1), "StudySans"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#ccd5dc")),
                ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f2f4f6")),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]),
        ),
        Spacer(1, 0.45 * inch),
        Paragraph("Built from Dentistry_Study_Guide.md, Master_Dentistry_Glossary.md, and Dental_Pulse_Glossary.md in the supplied Downloads folder. Original textbook PDF page references are retained throughout.", subtitle),
        PageBreak(),
    ]

    for section_index, (section_title, section_source, items) in enumerate(SECTIONS):
        story.extend([Paragraph(section_title, heading), Paragraph(section_source, source)])
        rows = []
        for item_title, item_definition in items:
            rows.append([Paragraph(item_title, term), Paragraph(item_definition, definition)])
        table = Table(rows, colWidths=[1.55 * inch, 4.95 * inch], repeatRows=0)
        table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f6f8fa")]),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#d9e0e5")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(table)
        if section_index < len(SECTIONS) - 1:
            story.append(PageBreak())

    document = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        rightMargin=0.62 * inch,
        leftMargin=0.62 * inch,
        topMargin=0.62 * inch,
        bottomMargin=0.68 * inch,
        title="Dentistry Study Reference",
        author="Rauny Ramirez",
        subject="Dentistry study and quiz reference",
    )
    document.build(story, onFirstPage=draw_page, onLaterPages=draw_page)


if __name__ == "__main__":
    build()
