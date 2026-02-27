import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CommandPalette } from "@/components/CommandPalette"

describe("CommandPalette", () => {
  it("filters commands and runs selected action", () => {
    const runJump = vi.fn()
    const runCopy = vi.fn()
    const close = vi.fn()

    render(
      <CommandPalette
        open
        onClose={close}
        actions={[
          {
            id: "jump-atm",
            label: "Jump ATM",
            description: "Jump to ATM strike",
            shortcut: "A",
            run: runJump
          },
          {
            id: "copy",
            label: "Copy contract",
            description: "Copy selected contract",
            shortcut: "C",
            run: runCopy
          }
        ]}
      />
    )

    fireEvent.change(screen.getByLabelText("Command search"), { target: { value: "jump" } })
    expect(screen.getByRole("button", { name: /Jump ATM/i })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Copy contract/i })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /Jump ATM/i }))
    expect(runJump).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
