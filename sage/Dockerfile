# syntax=docker/dockerfile:1
FROM sagemath/sagemath:latest
WORKDIR /code
COPY ./sage/requirements.txt ./requirements.txt
RUN sage --pip install --upgrade pip
RUN sage --pip install -r ./requirements.txt
COPY ./sage .
COPY ./messages.py .
ENV PYTHONUNBUFFERED=1
CMD ["sage", "main.sage"]