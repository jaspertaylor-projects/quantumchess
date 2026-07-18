import unittest

from app.matchmaking import router, service


class MatchmakingQueueTests(unittest.TestCase):
    def setUp(self):
        for queue in service._MM_QUEUES.values():
            queue.clear()
        service._MM_CLIENT_QUEUE.clear()
        service._MM_ROOMS.clear()
        service._MM_CLIENT_ROOM.clear()
        service._MM_CLIENT_LAST_SEEN.clear()
        service._MM_INVITES.clear()
        router._WS_ROOMS.clear()

    def test_ranked_and_unranked_players_never_cross_match(self):
        unranked_one = service.join("unranked-one", ranked=False)
        ranked_one = service.join("ranked-one", ranked=True)

        self.assertEqual(unranked_one.status, "queued")
        self.assertFalse(unranked_one.ranked)
        self.assertEqual(ranked_one.status, "queued")
        self.assertTrue(ranked_one.ranked)

        unranked_two = service.join("unranked-two", ranked=False)
        self.assertEqual(unranked_two.status, "matched")
        self.assertFalse(unranked_two.ranked)
        self.assertEqual(service.get_status("ranked-one").status, "queued")

        ranked_two = service.join("ranked-two", ranked=True)
        self.assertEqual(ranked_two.status, "matched")
        self.assertTrue(ranked_two.ranked)
        self.assertNotEqual(unranked_two.roomId, ranked_two.roomId)

    def test_switching_queue_removes_the_old_queue_entry(self):
        service.join("switching-player", ranked=False)
        switched = service.join("switching-player", ranked=True)

        self.assertEqual(switched.status, "queued")
        self.assertTrue(switched.ranked)
        self.assertNotIn("switching-player", service._MM_QUEUES["unranked"])
        self.assertIn("switching-player", service._MM_QUEUES["ranked"])

        other_unranked = service.join("other-unranked", ranked=False)
        self.assertEqual(other_unranked.status, "queued")
        ranked_peer = service.join("ranked-peer", ranked=True)
        self.assertEqual(ranked_peer.status, "matched")
        self.assertTrue(ranked_peer.ranked)

    def test_online_clock_is_fixed_at_five_plus_five(self):
        state = router._get_room_state("clock-room")

        self.assertEqual(state["clock"]["baseMs"], 5 * 60 * 1000)
        self.assertEqual(state["clock"]["incMs"], 5 * 1000)
        self.assertEqual(state["clock"]["whiteMs"], 5 * 60 * 1000)
        self.assertEqual(state["clock"]["blackMs"], 5 * 60 * 1000)


if __name__ == "__main__":
    unittest.main()
