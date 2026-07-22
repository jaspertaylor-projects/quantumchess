import unittest

from app.matchmaking.router import _transition_terminal_claim_locked


def room_state():
    return {
        "ended": False,
        "winner": None,
        "end_reason": None,
        "draw_offer_by": None,
        "clock": {"active": "white"},
    }


class RankedResultTests(unittest.TestCase):
    def test_one_engine_claim_cannot_award_a_win(self):
        state = room_state()
        first = _transition_terminal_claim_locked(state, "white", "white", "checkmate")
        self.assertTrue(first["pending"])
        self.assertFalse(state["ended"])

        confirmed = _transition_terminal_claim_locked(state, "black", "white", "checkmate")
        self.assertTrue(confirmed["gameOver"])
        self.assertTrue(state["ended"])
        self.assertEqual(state["winner"], "white")

    def test_mismatched_claims_do_not_end_the_game(self):
        state = room_state()
        _transition_terminal_claim_locked(state, "white", "white", "checkmate")
        result = _transition_terminal_claim_locked(state, "black", None, "stalemate")
        self.assertTrue(result["pending"])
        self.assertFalse(state["ended"])

    def test_resignation_winner_is_inferred_from_seat(self):
        state = room_state()
        result = _transition_terminal_claim_locked(state, "black", "black", "resignation")
        self.assertTrue(result["gameOver"])
        self.assertEqual(state["winner"], "white")
        self.assertEqual(state["end_reason"], "resignation")


if __name__ == "__main__":
    unittest.main()
