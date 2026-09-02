export const brandName = "Neno’s IT Repair";
export const publicOrigin = "https://repair.nenosensei.com";

export const publicRoutes = [
  { path: "/", title: "Computer repair in Philadelphia", description: "Appointment-only computer repair, onsite help, remote support, and training for Philadelphia customers." },
  { path: "/about", title: "About Neno’s IT Repair", description: "How Neno’s IT Repair approaches diagnosis, written estimates, approvals, privacy, and dependable computer service in Philadelphia." },
  { path: "/how-it-works", title: "How computer repair works", description: "From your first request through diagnosis, written approval, repair, payment, and return of your device." },
  { path: "/faq", title: "Computer repair FAQ", description: "Answers about appointments, passwords, backups, pricing, parts, payment, warranty, onsite work, and remote support." },
  { path: "/contact", title: "Request computer service", description: "Request an appointment with Neno’s IT Repair. Philadelphia service by appointment with same-day-normal email replies." },
  { path: "/services/computer-repair", title: "Computer repair", description: "Diagnosis and repair for desktop, laptop, Windows, startup, stability, and hardware problems in Philadelphia." },
  { path: "/services/malware-tuneups", title: "Malware cleanup and tune-ups", description: "Malware cleanup, PC tune-ups, cleaning, and Windows repair for Philadelphia customers." },
  { path: "/services/setup-data-transfer", title: "Setup, data transfer, and storage upgrades", description: "New computer setup, file transfer, SSD installation, and approved backup assistance." },
  { path: "/services/custom-pc", title: "Custom PC assembly", description: "Careful custom PC assembly, setup, and testing using compatible customer-approved parts." },
  { path: "/services/remote-support", title: "Remote computer support", description: "Appointment-based temporary remote support sessions for Philadelphia customers." },
  { path: "/services/onsite-support", title: "Onsite computer support", description: "Appointment-only onsite computer help throughout Philadelphia, starting at $119 labor." },
  { path: "/services/computer-training", title: "Computer training", description: "Practical one-to-one computer training at $65 per hour for Philadelphia customers." },
  { path: "/privacy", title: "Privacy Policy", description: "How Neno’s IT Repair collects, uses, protects, retains, and responds to requests about personal information." },
  { path: "/terms", title: "Service Terms", description: "Readable service terms covering estimates, approval, payment, data, parts, warranties, and electronic work orders." },
  { path: "/accessibility", title: "Accessibility", description: "Accessibility commitment and contact instructions for Neno’s IT Repair." },
];

export const routeByPath = new Map(publicRoutes.map((route) => [route.path, route]));

export const services = [
  { slug: "computer-repair", name: "Computer Repair", starting: "$129", summary: "Desktop, laptop, startup, stability, and hardware diagnosis and repair.", cta: "Ask about computer repair", options: ["Standard computer repair — $129", "Gaming PC repair — $169", "Windows repair — $139"] },
  { slug: "malware-tuneups", name: "Malware Cleanup and Tune-ups", starting: "$89", summary: "Careful cleanup, system checks, maintenance, and practical recommendations.", cta: "Ask about malware cleanup", options: ["PC tune-up — $89", "Malware or virus removal — $129", "Severe malware removal — $179", "PC cleaning — $69"] },
  { slug: "setup-data-transfer", name: "Setup, Data Transfer, and Storage Upgrades", starting: "$79", summary: "New-computer setup, file migration, and SSD or hard-drive installation.", cta: "Ask about setup or transfer", options: ["New computer setup — $129", "Data transfer — $149", "SSD or hard-drive installation — $79", "SSD installation with data migration — $149"] },
  { slug: "custom-pc", name: "Custom PC Assembly", starting: "$199", summary: "Assembly, cable management, initial setup, and testing for compatible approved parts.", cta: "Discuss a custom PC", options: ["Custom PC assembly — $199"] },
  { slug: "remote-support", name: "Remote Support", starting: "$79", summary: "A temporary, appointment-based support session for eligible Philadelphia customers.", cta: "Request remote support", options: ["Remote support — $79"] },
  { slug: "onsite-support", name: "Onsite Support", starting: "$119", summary: "Philadelphia onsite help by appointment, including ordinary travel within the city.", cta: "Request onsite support", options: ["Onsite support — $119"] },
  { slug: "computer-training", name: "Computer Training", starting: "$65/hour", summary: "One-to-one help with everyday computer tasks, safety, files, apps, and new devices.", cta: "Ask about computer training", options: ["Computer training — $65 per hour"] },
];

export const processSteps = [
  "Send a contact request.",
  "Receive a reply—normally the same day—and arrange an appointment.",
  "Pay the $49 diagnostic fee at intake.",
  "Receive a diagnosis and written estimate.",
  "Review and electronically approve the work order.",
  "Repair begins only after approval.",
  "Track progress through the optional Customer Portal.",
  "Receive the device or finish the remote session, pay the balance, and close the work order.",
];

export const faqItems = [
  ["Where do you provide service?", "Service is limited to Philadelphia. Drop-off and onsite appointments are available, and eligible Philadelphia customers may use temporary remote support. Private drop-off details are provided only after an appointment is confirmed."],
  ["Do I need to give you my password?", "Enter a device password yourself when practical. Neno’s IT Repair will never ask you to send a password through this website, email, or text."],
  ["Should I back up my files first?", "Yes. Customers are responsible for current backups. Separately approved backup assistance may be available, but no service can guarantee that every file will be recovered or preserved."],
  ["How does the diagnostic fee work?", "The $49 diagnostic fee is paid at intake and credited toward approved repair labor. If a repair is not worthwhile, you receive the diagnosis and options and owe only the applicable diagnostic unless you approve more work."],
  ["Are parts included?", "Published prices are starting labor prices. Approved parts, applicable tax, and special materials are additional. Non-stock parts and applicable tax are prepaid through a Square invoice or payment link before ordering."],
  ["How can I pay?", "Square card payments and cash are accepted. Card entry stays on Square-hosted pages; this site never stores card data. The remaining labor balance is due when service is returned or completed."],
  ["How long will service take?", "There is no standard turnaround promise. You receive an estimate after diagnosis based on the work, parts availability, and current schedule."],
  ["What warranty applies?", "Labor includes a 30-day warranty for a recurrence caused by the workmanship performed. Installed parts carry the manufacturer or supplier warranty. Customer-supplied parts do not receive a shop parts warranty."],
  ["What if I need to cancel?", "Please give 24 hours’ notice when possible. There is no cancellation or no-show fee."],
  ["How does remote support work?", "At the appointment, you receive instructions for temporary remote-support software. The session is limited to the approved work and the temporary access is ended afterward."],
];

export const statusLabels = {
  "request-received": "Request received",
  "diagnosing-estimating": "Diagnosing / estimating",
  "awaiting-approval": "Awaiting approval",
  "approved-queued": "Approved / queued",
  "in-repair": "In repair",
  "ready-for-pickup-payment": "Ready for pickup / payment",
  closed: "Closed",
};

export const statusOrder = Object.keys(statusLabels);
