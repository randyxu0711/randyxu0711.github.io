#let resume(
  author: "",
  location: "",
  contacts: (),
  accent: rgb("#793327"),
  ink: rgb("#2a1f19"),
  muted: rgb("#5c4f45"),
  font: ("Inter", "Noto Sans CJK TC"),
  body,
) = {
  set document(author: author, title: author + " Resume")
  set text(font: font, size: 10pt, lang: "en", fill: ink, ligatures: false)
  set page(paper: "a4", margin: 0.5in)
  set par(justify: true)

  show link: it => box(text(fill: accent, it))

  show heading.where(level: 2): it => [
    #set text(fill: accent, size: 11pt, weight: 700)
    #pad(top: 0pt, bottom: -10pt, it.body)
    #line(length: 100%, stroke: 0.8pt + accent)
  ]

  text(size: 20pt, weight: 700, fill: accent, author)
  h(1fr)
  text(size: 9pt, fill: muted, location)
  v(-0.3em)
  text(size: 9pt, fill: muted, contacts.join(" · "))
  v(0.2em)

  body
}

#let job(title: "", company: "", location: "", dates: "") = [
  #strong(title) #h(1fr) #dates \
  #text(weight: 600, fill: rgb("#793327"), company) #h(1fr) #emph(location)
]

#let proj(name, repo, stack, dates) = [
  #strong(link("https://github.com/" + repo, name)) | #emph(stack) #h(1fr) #dates
]
