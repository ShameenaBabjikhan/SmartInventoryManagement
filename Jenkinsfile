
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {
        stage('Environment Check') {
            steps {
                bat 'git --version'
                bat 'python --version'
                bat 'docker --version'
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'python -m venv .venv'
                bat '.venv\\Scripts\\python.exe -m pip install --upgrade pip'
                bat '.venv\\Scripts\\python.exe -m pip install -r backend\\requirements.txt'
                bat '.venv\\Scripts\\python.exe -m pip install pytest'
            }
        }

        stage('Run Automated Tests') {
            steps {
                bat '.venv\\Scripts\\python.exe -m pytest -v'
            }
        }

        stage('Build Docker Image') {
            steps {
                bat 'docker build -t smart-inventory-app:%BUILD_NUMBER% .'
            }
        }
    }

    post {
        success {
            echo 'SUCCESS: Tests passed and Docker image built.'
        }

        failure {
            echo 'FAILED: Check the stage logs to identify the problem.'
        }

        always {
            echo 'Smart Inventory CI pipeline finished.'
        }
    }
}
