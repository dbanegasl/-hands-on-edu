import os
import httpx
from dotenv import load_dotenv

load_dotenv()

MOODLE_URL = os.getenv("MOODLE_URL", "")
MOODLE_TOKEN = os.getenv("MOODLE_TOKEN", "")


class MoodleClient:
    """
    Client for Moodle REST API.
    Allows HandsOnEdu modules to send grades and completion events to Moodle.
    """

    def __init__(self):
        self.base_url = MOODLE_URL.rstrip("/")
        self.token = MOODLE_TOKEN
        self.endpoint = f"{self.base_url}/webservice/rest/server.php"

    def _params(self, function: str) -> dict:
        return {
            "wstoken": self.token,
            "wsfunction": function,
            "moodlewsrestformat": "json",
        }

    async def get_courses(self) -> list:
        """Retrieve all available courses."""
        async with httpx.AsyncClient() as client:
            response = await client.get(self.endpoint, params=self._params("core_course_get_courses"))
            response.raise_for_status()
            return response.json()

    async def submit_grade(self, course_id: int, item_name: str, user_id: int, grade: float) -> dict:
        """
        Submit a grade for a student.
        Requires the Gradebook write service to be enabled in Moodle.
        """
        params = {
            **self._params("core_grades_update_grades"),
            "source": "HandsOnEdu",
            "courseid": course_id,
            "component": "mod_assign",
            "activityid": 0,
            "itemnumber": 0,
            "grades[0][studentid]": user_id,
            "grades[0][grade]": grade,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(self.endpoint, data=params)
            response.raise_for_status()
            return response.json()

    async def mark_activity_complete(self, course_module_id: int, user_id: int) -> dict:
        """Mark a Moodle activity as completed for a student."""
        params = {
            **self._params("core_completion_update_activity_completion_status_manually"),
            "cmid": course_module_id,
            "completed": 1,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(self.endpoint, data=params)
            response.raise_for_status()
            return response.json()
