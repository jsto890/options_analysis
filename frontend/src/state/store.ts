import { useReducer } from "react"

import { EMPTY_STATE, applyEnvelope } from "@/ws/reducer"

export function useStreamStore() {
  return useReducer(applyEnvelope, EMPTY_STATE)
}
