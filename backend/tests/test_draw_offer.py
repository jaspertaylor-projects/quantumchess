import unittest

from app.matchmaking.router import _transition_draw_offer_locked


def room_state():
    return {
        "ended": False,
        "winner": None,
        "end_reason": None,
        "announced_end": False,
        "draw_offer_by": None,
        "clock": {"active": "white"},
    }


class DrawOfferTransitionTests(unittest.TestCase):
    def test_offer_persists_until_a_valid_resolution(self):
        state = room_state()
        offered = _transition_draw_offer_locked(state, "white", "offer")
        self.assertEqual(offered["status"], "pending")
        self.assertEqual(state["draw_offer_by"], "white")

        # An unrelated game update does not consume the offer.
        state["seq"] = 1
        state["turn"] = "black"
        self.assertEqual(state["draw_offer_by"], "white")

        retracted = _transition_draw_offer_locked(state, "white", "retract")
        self.assertEqual(retracted["resolution"], "retracted")
        self.assertIsNone(state["draw_offer_by"])

    def test_only_opponent_can_answer_and_only_offerer_can_retract(self):
        state = room_state()
        _transition_draw_offer_locked(state, "white", "offer")
        self.assertEqual(
            _transition_draw_offer_locked(state, "white", "accept")["error"],
            "offerer_cannot_answer",
        )
        self.assertEqual(
            _transition_draw_offer_locked(state, "black", "retract")["error"],
            "no_owned_draw_offer",
        )
        declined = _transition_draw_offer_locked(state, "black", "decline")
        self.assertEqual(declined["resolution"], "declined")
        self.assertFalse(state["ended"])

    def test_acceptance_ends_the_game_as_an_agreed_draw(self):
        state = room_state()
        _transition_draw_offer_locked(state, "black", "offer")
        accepted = _transition_draw_offer_locked(state, "white", "accept")
        self.assertTrue(accepted["gameOver"])
        self.assertTrue(state["ended"])
        self.assertIsNone(state["winner"])
        self.assertEqual(state["end_reason"], "agreement")
        self.assertEqual(state["clock"]["active"], "none")
        self.assertIsNone(state["draw_offer_by"])


if __name__ == "__main__":
    unittest.main()
