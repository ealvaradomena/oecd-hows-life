return {
  ["oecd-rules"] = function()
    local slogan = pandoc.Div({
      pandoc.Plain({
        pandoc.Span({ pandoc.Str("Do as") }, pandoc.Attr("", { "oecd-rules__slogan-line" })),
        pandoc.LineBreak(),
        pandoc.Span({ pandoc.Str("OECD") }, pandoc.Attr("", { "oecd-rules__slogan-oecd" })),
        pandoc.LineBreak(),
        pandoc.Span({ pandoc.Str("says") }, pandoc.Attr("", { "oecd-rules__slogan-line" }))
      })
    }, pandoc.Attr("", { "oecd-rules__slogan" }))

    local guidance = pandoc.Div({
      pandoc.Para({
        pandoc.Str("This website uses the OECD API to teach "),
        pandoc.Str("reproducible R workflows.")
      }),
      pandoc.Para({
        pandoc.Str("For "),
        pandoc.Strong({ pandoc.Str("authoritative") }),
        pandoc.Str(" and "),
        pandoc.Strong({ pandoc.Str("up-to-date") }),
        pandoc.Str(" technical guidance, "),
        pandoc.Str("consult the official OECD documentation.")
      })
    }, pandoc.Attr("", { "oecd-rules__guidance" }))

    return pandoc.Div(
      { slogan, guidance },
      pandoc.Attr("", { "oecd-rules" })
    )
  end
}