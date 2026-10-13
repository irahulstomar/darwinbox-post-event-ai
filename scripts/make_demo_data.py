"""Generate the synthetic webinar registrant export (Zoom attendee report format) and the
pre-existing HubSpot contacts used to exercise dedupe.

Real companies, fake people. Every email ends in .example.com (IANA-reserved, accepts no mail), so nothing
can ever reach a real inbox. Speakers use Gmail aliases of the demo owner instead.
Deterministic: same output every run.
"""
import csv, json, random, pathlib
from datetime import datetime, timedelta

random.seed(42)
OUT = pathlib.Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(exist_ok=True)

EVENT_NAME = "Darwinbox Cortex and the AI-Native Era of HCM"
EVENT_START = datetime(2026, 10, 12, 18, 30)   # IST
EVENT_MIN = 37
DEMO_INBOX = "rahulsinghtomar210+{}@gmail.com"

# first, last, title, organization (as typed), company domain, country, attended, minutes, questions, email style
# email style: w = work, g = gmail, y = yahoo, o = outlook
PEOPLE = [
    # India
    ("Ananya", "Rao", "Sr. Mgr - HR", "Infosys Ltd", "infosys.com", "India", 1, 41, 1, "w"),
    ("Vikram", "Shetty", "CHRO", "TATA STEEL", "tatasteel.com", "India", 1, 37, 2, "g"),
    ("Meera", "Iyer", "Head - Talent Acquisition", "Mahindra & Mahindra", "mahindra.com", "India", 1, 35, 0, "w"),
    ("arjun", "menon", "hris manager", "wipro", "wipro.com", "", 1, 29, 1, "w"),
    ("Rahul", "Sharma", "HR Business Partner", "HDFC Bank", "hdfcbank.com", "India", 0, 0, 0, "w"),
    ("Rahul", "Sharma", "Payroll Lead", "Wipro Limited", "wipro.com", "India", 1, 22, 0, "w"),
    ("Kavya", "Reddy", "VP - People", "Swiggy", "swiggy.com", "India", 1, 37, 1, "w"),
    ("Siddharth", "Jain", "", "Zomato", "zomato.com", "India", 0, 0, 0, "w"),
    ("Priyanka", "Das", "L&D Manager", "Asian Paints Ltd.", "asianpaints.com", "India", 1, 30, 0, "w"),
    ("Nikhil", "Bansal", "Finance Controller", "Bajaj Finserv", "bajajfinserv.in", "India", 0, 0, 0, "w"),
    ("Sneha", "Kulkarni", "Chief People Officer", "Nykaa", "nykaa.com", "India", 1, 37, 3, "w"),
    ("Aditya", "Verma", "IT Director", "Apollo Hospitals", "apollohospitals.com", "India", 1, 18, 0, "w"),
    ("Pooja", "Nair", "Talent Acquisition Specialist", "Dr. Reddy's Laboratories", "drreddys.com", "India", 0, 0, 0, "y"),
    ("Karan", "Malhotra", "Director HR Ops", "Bharti Airtel", "airtel.in", "", 1, 33, 1, "w"),
    ("Divya", "Pillai", "HR Generalist", "Marico", "marico.com", "India", 1, 12, 0, "w"),
    ("Rohan", "Gupta", "Student", "IIM Ahmedabad", "iima.ac.in", "India", 1, 37, 2, "w"),
    ("Ishita", "Chawla", "Sr HRBP", "PAYTM", "paytm.com", "India", 0, 0, 0, "w"),
    ("Manish", "Agarwal", "Head HRIS & Analytics", "JSW Steel", "jsw.in", "India", 1, 36, 2, "w"),
    ("Tanvi", "Joshi", "Recruiter", "Myntra", "myntra.com", "India", 0, 0, 0, "g"),
    ("Suresh", "Babu", "GM - Human Resources", "Adani Ports", "adaniports.com", "India", 1, 26, 0, "w"),
    ("Lakshmi", "Narayanan", "", "chargebee", "chargebee.com", "India", 1, 8, 0, "w"),
    ("Farhan", "Qureshi", "People Ops Manager", "Kissflow", "kissflow.com", "India", 0, 0, 0, "w"),
    ("Neha", "Kapoor", "AVP - HR", "ICICI Lombard", "icicilombard.com", "India", 1, 34, 1, "w"),
    ("Gaurav", "Singh", "Head of Payroll", "Larsen & Toubro", "larsentoubro.com", "India", 1, 24, 0, "w"),
    ("Ritu", "Saxena", "HR Ops Executive", "Reliance Retail", "relianceretail.com", "India", 0, 0, 0, "w"),
    ("Amit", "Patel", "Chief Human Resources Officer", "Zydus Lifesciences", "zyduslife.com", "India", 1, 37, 1, "w"),
    ("Shreya", "Ghosh", "TA Lead", "Razorpay", "razorpay.com", "India", 1, 32, 2, "w"),
    ("Vivek", "Raman", "Sr. Director - Total Rewards", "Tech Mahindra", "techmahindra.com", "India", 0, 0, 0, "w"),
    ("Ayesha", "Khan", "Employee Experience Manager", "Godrej Consumer Products", "godrejcp.com", "India", 1, 28, 0, "w"),
    ("Harish", "Kumar", "", "ITC Limited", "itcportal.com", "India", 1, 10, 0, "g"),
    ("Nandini", "Rao", "Director - HR", "Hindustan Unilever", "hul.co.in", "India", 0, 0, 0, "w"),
    ("Prakash", "Menon", "HR Head", "Max Healthcare", "maxhealthcare.in", "India", 1, 30, 1, "w"),
    ("Anjali", "Mehta", "HRIS Specialist", "Bajaj Finserv Ltd", "bajajfinserv.in", "India", 1, 26, 0, "w"),
    ("Sanjay", "Rao", "Payroll Manager", "Swiggy Ltd", "swiggy.com", "India", 1, 22, 0, "w"),
    ("Tanya", "Bhatia", "HRBP", "swiggy", "swiggy.com", "", 0, 0, 0, "w"),
    # SEA
    ("Wei Ling", "Tan", "Regional HR Director", "Grab", "grab.com", "Singapore", 1, 37, 2, "w"),
    ("Marcus", "Lim", "HRIS Lead", "Sea Limited", "sea.com", "Singapore", 0, 0, 0, "w"),
    ("Kevin", "Ong", "HR Business Partner", "GRAB HOLDINGS", "grab.com", "Singapore", 1, 20, 0, "w"),
    ("Jasmine", "Wong", "Talent Director", "Maybank", "maybank.com", "Malaysia", 1, 31, 1, "w"),
    ("Ahmad", "Faiz", "Senior Manager, HR Technology", "PETRONAS", "petronas.com", "Malaysia", 1, 27, 0, "w"),
    ("Maria", "Santos", "CHRO", "Globe Telecom", "globe.com.ph", "Philippines", 1, 37, 1, "w"),
    ("Paolo", "Reyes", "HR Manager", "Jollibee Foods Corp", "jollibee.com.ph", "Philippines", 0, 0, 0, "w"),
    ("Andrea", "Cruz", "VP Human Resources", "Ayala Land", "ayalaland.com.ph", "Philippines", 1, 34, 0, "w"),
    ("Carlo", "Mendoza", "Comp & Ben Manager", "Unilab", "unilab.com.ph", "", 1, 20, 0, "w"),
    ("Dewi", "Lestari", "Head of People", "GoTo Group", "gotocompany.com", "Indonesia", 1, 36, 1, "w"),
    ("Budi", "Santoso", "", "Indosat Ooredoo Hutchison", "ioh.co.id", "Indonesia", 0, 0, 0, "w"),
    ("Nguyen Thi", "Hoa", "HR Director", "Vietjet", "vietjetair.com", "Vietnam", 1, 25, 0, "w"),
    ("Tran Minh", "Quan", "Finance Manager", "Masan Group", "masangroup.com", "Vietnam", 0, 0, 0, "w"),
    # Middle East
    ("Omar", "Haddad", "Group CHRO", "Majid Al Futtaim", "majidalfuttaim.com", "UAE", 1, 37, 2, "w"),
    ("Reem", "Al Suwaidi", "Head of Talent", "MAF", "majidalfuttaim.com", "UAE", 1, 29, 1, "w"),
    ("Layla", "Mansour", "HR Transformation Lead", "Emirates NBD", "emiratesnbd.com", "United Arab Emirates", 1, 33, 1, "w"),
    ("Yousef", "Al-Harbi", "Director of HR Operations", "Almarai", "almarai.com", "Saudi Arabia", 0, 0, 0, "w"),
    ("Fatima", "Zahra", "Talent Acquisition Manager", "Aramex", "aramex.com", "UAE", 1, 21, 0, "o"),
    ("Khalid", "Rahman", "IT Manager", "Al-Futtaim Group", "alfuttaim.com", "", 0, 0, 0, "w"),
    ("Sara", "Nasser", "People Analytics Lead", "Careem", "careem.com", "UAE", 1, 30, 1, "w"),
    ("Hassan", "Ali", "HRBP", "noon", "noon.com", "UAE", 0, 0, 0, "w"),
    # US / UK
    ("Jessica", "Miller", "VP, People Operations", "Orion Innovation", "orioninc.com", "United States", 1, 37, 1, "w"),
    ("David", "Chen", "HRIS Analyst", "Zapier", "zapier.com", "United States", 0, 0, 0, "w"),
    ("Emily", "Carter", "Director, Total Rewards", "Freshworks", "freshworks.com", "United States", 1, 28, 0, "w"),
    ("Michael", "Brown", "Consultant", "Deloitte", "deloitte.com", "United States", 1, 15, 0, "w"),
    ("Sophie", "Turner", "HR Manager", "Wise", "wise.com", "United Kingdom", 0, 0, 0, "w"),
    ("James", "Wilson", "Head of HR", "Ocado", "ocado.com", "United Kingdom", 1, 19, 0, "w"),
]

# Registered twice: the "duplicate" row plus how it differs. Tests in-file dedupe.
DUPLICATES = [
    # (index of original, overrides)
    (2, dict(first="meera", last="iyer", org="Mahindra", style="g", attended=0)),     # second sign-up with gmail, didn't join on it
    (6, dict(first="Kavya ", last=" Reddy")),                                          # same email, stray spaces
    (48, dict(last="Hadad", email_local="o.haddad")),                                  # typo + different work email
    (35, dict(first="Tan", last="Wei Ling")),                                          # name order swapped, same email
]

SPEAKERS = [
    ("Jayant", "Paleti", "Co-founder", "Darwinbox", "darwinbox.com", "India", "jayant"),
    ("Brett", "Ungashick", "Founder", "OutSail", "outsail.co", "United States", "brett"),
]


def email_for(first, last, domain, style, local=None):
    local = local or f"{first.strip().lower().replace(' ', '')}.{last.strip().lower().replace(' ', '')}"
    if style == "w":
        return f"{local}@{domain}.example.com"
    num = random.randint(80, 99)
    host = {"g": "gmail.com", "y": "yahoo.com", "o": "outlook.com"}[style]
    return f"{local}{num}@{host}.example.com"


def phone(country):
    code = {"India": "+91", "Singapore": "+65", "Malaysia": "+60", "Philippines": "+63", "Indonesia": "+62",
            "Vietnam": "+84", "UAE": "+971", "United Arab Emirates": "+971", "Saudi Arabia": "+966",
            "United States": "+1", "United Kingdom": "+44"}.get(country, "")
    return "" if random.random() < 0.4 else f"{code} {random.randint(70000, 99999)} {random.randint(10000, 99999)}".strip()


def fmt(dt):
    return dt.strftime("%m/%d/%Y %I:%M:%S %p") if dt else "--"


def row(first, last, title, org, domain, country, attended, minutes, questions, style, role="Attendee",
        email=None, reg_days=None):
    reg = EVENT_START - timedelta(days=reg_days if reg_days is not None else random.randint(1, 28),
                                  minutes=random.randint(0, 600))
    join = leave = None
    if attended:
        join = EVENT_START + timedelta(minutes=random.randint(0, EVENT_MIN - minutes) if minutes < EVENT_MIN else -random.randint(0, 4))
        leave = join + timedelta(minutes=minutes)
    return {
        "Attended": "Yes" if attended else "No",
        "User Name (Original Name)": f"{first} {last}".strip() if attended else "",
        "First Name": first,
        "Last Name": last,
        "Email": email or email_for(first, last, domain, style),
        "Phone": phone(country),
        "Registration Time": fmt(reg),
        "Approval Status": "approved",
        "Join Time": fmt(join),
        "Leave Time": fmt(leave),
        "Time in Session (minutes)": minutes if attended else "",
        "Is Guest": "Yes" if role == "Attendee" else "No",
        "Country/Region Name": country,
        "Job Title": title,
        "Organization": org,
        "Questions Asked": questions if attended else "",
        "Role": role,
    }


rows = [row(*p) for p in PEOPLE]
for idx, o in DUPLICATES:
    f, l, t, org, dom, c, att, mins, q, style = PEOPLE[idx]
    same_email = "first" in o and "email_local" not in o and "style" not in o
    rows.append(row(o.get("first", f), o.get("last", l), t, o.get("org", org), dom, c,
                    o.get("attended", att), mins if o.get("attended", att) else 0, q, o.get("style", style),
                    email=rows[idx]["Email"] if same_email else
                    (email_for(f, l, dom, "w", o["email_local"]) if "email_local" in o else None)))
for f, l, t, org, dom, c, alias in SPEAKERS:
    rows.append(row(f, l, t, org, dom, c, 1, EVENT_MIN, 0, "w", role="Panelist",
                    email=DEMO_INBOX.format(alias), reg_days=30))

random.shuffle(rows)
csv_path = OUT / "registrants_zoom_export.csv"
with open(csv_path, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader(); w.writerows(rows)

# Contacts already in the CRM before the event, spelled slightly differently. Tests HubSpot dedupe.
# expect: what M1 should do with the matching CSV row.
HUBSPOT_EXISTING = [
    dict(firstname="Ananya", lastname="Rao", email="ananya.rao@infosys.com.example.com", company="Infosys Limited", jobtitle="HR Manager", lifecyclestage="lead", owner="india", expect="exact email -> update"),
    dict(firstname="Vikram", lastname="Shetty", email="vikram.shetty@tatasteel.com.example.com", company="Tata Steel Limited", jobtitle="Chief HR Officer", lifecyclestage="lead", owner="senior", expect="CSV has gmail -> fuzzy name+company merge"),
    dict(firstname="Arjun", lastname="Menon", email="arjun.menon@wipro.com.example.com", company="Wipro", jobtitle="HRIS Manager", lifecyclestage="subscriber", owner="india", expect="exact email -> update"),
    dict(firstname="Rahul", lastname="Sharma", email="rahul.sharma@hdfcbank.com.example.com", company="HDFC Bank", jobtitle="HRBP", lifecyclestage="lead", owner="india", expect="HDFC row exact; Wipro Rahul Sharma must NOT merge"),
    dict(firstname="Kavya", lastname="Reddy", email="kavya.reddy@swiggy.com.example.com", company="Swiggy", jobtitle="VP People", lifecyclestage="lead", owner="senior", expect="exact email -> update"),
    dict(firstname="Sneha", lastname="Kulkarni", email="sneha.k@nykaa.com.example.com", company="Nykaa E-Retail", jobtitle="CPO", lifecyclestage="subscriber", owner="india", expect="different email -> fuzzy name+company merge"),
    dict(firstname="Maria", lastname="Santos", email="maria.santos@globe.com.ph.example.com", company="Globe Telecom Inc", jobtitle="Chief Human Resources Officer", lifecyclestage="lead", owner="sea", expect="exact email -> update"),
    dict(firstname="Omar", lastname="Haddad", email="omar.haddad@majidalfuttaim.com.example.com", company="Majid Al Futtaim Holding", jobtitle="Group CHRO", lifecyclestage="lead", owner="senior", expect="exact email; the 'Omar Hadad' duplicate row also folds in"),
    dict(firstname="Jessica", lastname="Miller", email="jessica.miller@orioninc.com.example.com", company="Orion Innovation", jobtitle="VP People Ops", lifecyclestage="lead", owner="senior", expect="exact email -> update"),
    dict(firstname="Manish", lastname="Agarwal", email="manish.agarwal@jsw.in.example.com", company="JSW Steel Ltd", jobtitle="Head - HRIS", lifecyclestage="subscriber", owner="india", expect="exact email -> update"),
    dict(firstname="Pooja", lastname="Nair", email="pooja.nair@drreddys.com.example.com", company="Dr Reddys", jobtitle="TA Specialist", lifecyclestage="subscriber", owner="india", expect="CSV has yahoo -> fuzzy name+company merge"),
    dict(firstname="Dewi", lastname="Lestari", email="dewi.lestari@gotocompany.com.example.com", company="GoTo", jobtitle="Head of People", lifecyclestage="lead", owner="sea", expect="exact email -> update"),
    dict(firstname="Priya", lastname="Das", email="priya.das@asianpaints.com.example.com", company="Asian Paints", jobtitle="L&D Lead", lifecyclestage="subscriber", owner="india", expect="near match to Priyanka Das -> needs review"),
    dict(firstname="Layla", lastname="Mansour", email="layla.m@emiratesnbd.com.example.com", company="Emirates NBD Bank", jobtitle="HR Transformation", lifecyclestage="lead", owner="sea", expect="different email -> fuzzy name+company merge"),
]
(OUT / "hubspot_existing_contacts.json").write_text(json.dumps(HUBSPOT_EXISTING, indent=2), encoding="utf-8")

att = sum(r["Attended"] == "Yes" and r["Role"] == "Attendee" for r in rows)
print(f"{csv_path.name}: {len(rows)} rows | attendees {att} | no-shows {sum(r['Attended'] == 'No' for r in rows)} | "
      f"panelists {sum(r['Role'] == 'Panelist' for r in rows)} | in-file duplicates {len(DUPLICATES)}")
print(f"hubspot_existing_contacts.json: {len(HUBSPOT_EXISTING)} contacts")
