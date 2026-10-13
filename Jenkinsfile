
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {

        stage('Environment Check') {
            steps {
                echo 'Checking installed tools...'

                bat 'git --version'

                bat '"C:\\Users\\Shameena\\AppData\\Local\\Programs\\Python\\Python313\\python.exe" --version'

                bat '"C:\\Users\\Shameena\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe" --version'
            }
        }

        stage('Install Dependencies') {
            steps {
                echo 'Creating Python virtual environment...'

                bat '"C:\\Users\\Shameena\\AppData\\Local\\Programs\\Python\\Python313\\python.exe" -m venv .venv'

                echo 'Upgrading pip...'

                bat '.venv\\Scripts\\python.exe -m pip install --upgrade pip'

                echo 'Installing application dependencies...'

                bat '.venv\\Scripts\\python.exe -m pip install -r backend\\requirements.txt'

                echo 'Installing pytest...'

                bat '.venv\\Scripts\\python.exe -m pip install pytest'
            }
        }

        stage('Run Automated Tests') {
            steps {
                echo 'Running application tests...'

                bat '.venv\\Scripts\\python.exe -m pytest -v'
            }
        }

        stage('Build Docker Image') {
            steps {
                echo 'Building Smart Inventory Docker image...'

                bat '"C:\\Users\\Shameena\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe" build -t smart-inventory-app:%BUILD_NUMBER% .'
            }
        }
    }

    post {
        success {
            echo 'SUCCESS: All tests passed and Docker image built.'
        }

        failure {
            echo 'FAILED: Check Console Output for the error.'
        }

        always {
            echo 'Smart Inventory CI pipeline finished.'
        }
    }
}
