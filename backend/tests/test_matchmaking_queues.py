import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from app.matchmaking import router, service


class MatchmakingQueueTests(unittest.TestCase):
    def setUp(self):
        for queue in service._MM_QUEUES.values():
            queue.clear()
        service._MM_CLIENT_QUEUE.clear()
        service._MM_ROOMS.clear()
        service._MM_CLIENT_ROOM.clear()
        service._MM_CLIENT_LAST_SEEN.clear()
        service._MM_CLIENT_AUTH.clear()
        service._MM_QUEUE_JOINED_AT.clear()
        service._MM_USER_CLIENT.clear()
        service._MM_INVITES.clear()
        router._WS_ROOMS.clear()

    def test_ranked_and_unranked_players_never_cross_match(self):
        unranked_one = service.join("unranked-one", ranked=False)
        ranked_one = service.join(
            "ranked-one", ranked=True,
            identity={"user_id": "user-one", "username": "One", "rating": 1200},
        )

        self.assertEqual(unranked_one.status, "queued")
        self.assertFalse(unranked_one.ranked)
        self.assertEqual(ranked_one.status, "queued")
        self.assertTrue(ranked_one.ranked)

        unranked_two = service.join("unranked-two", ranked=False)
        self.assertEqual(unranked_two.status, "matched")
        self.assertFalse(unranked_two.ranked)
        self.assertEqual(service.get_status("ranked-one", ranked_one.ticket).status, "queued")

        ranked_two = service.join(
            "ranked-two", ranked=True,
            identity={"user_id": "user-two", "username": "Two", "rating": 1250},
        )
        self.assertEqual(ranked_two.status, "matched")
        self.assertTrue(ranked_two.ranked)
        self.assertNotEqual(unranked_two.roomId, ranked_two.roomId)

    def test_switching_queue_removes_the_old_queue_entry(self):
        service.join("switching-player", ranked=False)
        switched = service.join(
            "switching-player", ranked=True,
            identity={"user_id": "switch-user", "username": "Switch", "rating": 1200},
        )

        self.assertEqual(switched.status, "queued")
        self.assertTrue(switched.ranked)
        self.assertNotIn("switching-player", service._MM_QUEUES["unranked"])
        self.assertIn("switching-player", service._MM_QUEUES["ranked"])

        other_unranked = service.join("other-unranked", ranked=False)
        self.assertEqual(other_unranked.status, "queued")
        ranked_peer = service.join(
            "ranked-peer", ranked=True,
            identity={"user_id": "peer-user", "username": "Peer", "rating": 1200},
        )
        self.assertEqual(ranked_peer.status, "matched")
        self.assertTrue(ranked_peer.ranked)

    def test_ranked_requires_identity_and_ticket(self):
        denied = service.join("ranked-anon", ranked=True)
        self.assertEqual(denied.status, "authentication_required")

        queued = service.join(
            "ranked-auth", ranked=True,
            identity={"user_id": "auth-user", "username": "Auth", "rating": 1400},
        )
        self.assertTrue(queued.ticket)
        self.assertEqual(service.get_status("ranked-auth").status, "authentication_required")
        self.assertEqual(service.get_status("ranked-auth", queued.ticket).status, "queued")
        self.assertEqual(
            service.join("ranked-auth", ranked=False).status,
            "authentication_required",
        )

        wrong_user = service.join(
            "ranked-auth", ranked=True,
            identity={"user_id": "attacker", "username": "Nope", "rating": 1400},
        )
        self.assertEqual(wrong_user.status, "authentication_required")
        self.assertEqual(service.get_status("ranked-auth", queued.ticket).status, "queued")

    def test_ranked_rating_range_widens_while_waiting(self):
        clock = [1000.0]
        with patch.object(service, "_now", side_effect=lambda: clock[0]):
            first = service.join(
                "ranked-low", ranked=True,
                identity={"user_id": "low-user", "username": "Low", "rating": 1200},
            )
            second = service.join(
                "ranked-high", ranked=True,
                identity={"user_id": "high-user", "username": "High", "rating": 1450},
            )
            self.assertEqual(second.status, "queued")

            clock[0] += 20.1
            widened = service.get_status("ranked-low", first.ticket)
            self.assertEqual(widened.status, "matched")
            self.assertEqual(widened.opponentRating, 1450)

    def test_concurrent_ranked_joins_create_one_room_per_pair(self):
        clients = [f"parallel-{i}" for i in range(10)]

        def join_one(index):
            return service.join(
                clients[index], ranked=True,
                identity={
                    "user_id": f"parallel-user-{index}",
                    "username": f"P{index}",
                    "rating": 1500,
                },
            )

        with ThreadPoolExecutor(max_workers=10) as pool:
            responses = list(pool.map(join_one, range(10)))

        self.assertEqual(len(service._MM_ROOMS), 5)
        tickets = {client: response.ticket for client, response in zip(clients, responses)}
        statuses = [service.get_status(client, tickets[client]) for client in clients]
        self.assertTrue(all(status.status == "matched" for status in statuses))
        self.assertEqual(len(service._MM_ROOMS), 5)
        seated = [pid for room in service._MM_ROOMS.values() for pid in room["players"]]
        self.assertEqual(sorted(seated), sorted(clients))

    def test_online_clock_is_fixed_at_five_plus_five(self):
        state = router._get_room_state("clock-room")

        self.assertEqual(state["clock"]["baseMs"], 5 * 60 * 1000)
        self.assertEqual(state["clock"]["incMs"], 5 * 1000)
        self.assertEqual(state["clock"]["whiteMs"], 5 * 60 * 1000)
        self.assertEqual(state["clock"]["blackMs"], 5 * 60 * 1000)


if __name__ == "__main__":
    unittest.main()
