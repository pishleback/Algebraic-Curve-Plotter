# syntax=docker/dockerfile:1
FROM python:3.10
WORKDIR /code
EXPOSE 5000
RUN apt-get update
RUN apt-get -y install gcc musl-dev
RUN apt-get -y install npm
RUN pip install --upgrade pip
COPY ./app/requirements.txt ./requirements.txt
RUN pip install -r ./requirements.txt
RUN npm install regl quaternion brfs
RUN npm install -g browserify
COPY ./app .
RUN browserify -t brfs ./static/regl.js -o ./static/regl_compiled.js
COPY ./messages.py .
COPY ./sage_messages.py .
ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1
CMD ["flask", "--debug", "run"]
