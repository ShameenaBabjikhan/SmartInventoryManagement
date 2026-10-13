
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        PYTHON_EXE = 'C:\\Users\\Shameena\\AppData\\Local\\Programs\\Python\\Python313\\python.exe'

        DOCKER_EXE = 'C:\\Users\\Shameena\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe'

        COMPOSE_EXE = 'C:\\Users\\Shameena\\.docker\\cli-plugins\\docker-compose.exe'

        DOCKER_CONFIG = 'C:\\Users\\Shameena\\.docker'

        PROJECT_DIR = 'C:\\Users\\Shameena\\SmartInventoryManagement'

        COMPOSE_IMAGE = 'smartinventorymanagement-smart-inventory'
    }

    stages {

        stage('Environment Check') {
            steps {
                echo 'Checking installed tools...'

                bat 'git --version'

                bat '"%PYTHON_EXE%" --version'

                bat '"%DOCKER_EXE%" --version'

                bat '"%DOCKER_EXE%" info'

                bat '"%COMPOSE_EXE%" version'
            }
        }

        stage('Install Dependencies') {
            steps {
                echo 'Creating Python virtual environment...'

                bat '"%PYTHON_EXE%" -m venv .venv'

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
                echo 'Running automated application tests...'

                bat '.venv\\Scripts\\python.exe -m pytest -v'
            }
        }

        stage('Build Docker Image') {
            steps {
                echo 'Building the tested application image...'

                bat '"%DOCKER_EXE%" build -t smart-inventory-app:%BUILD_NUMBER% .'
            }
        }

        stage('Prepare Deployment Image') {
            steps {
                echo 'Tagging the tested image for Docker Compose...'

                bat '"%DOCKER_EXE%" tag smart-inventory-app:%BUILD_NUMBER% %COMPOSE_IMAGE%'
            }
        }

        stage('Deploy Application') {
            steps {
                echo 'Deploying the application using Docker Compose...'

                bat '''
                    cd /d "%PROJECT_DIR%"

                    "%COMPOSE_EXE%" --context default -f compose.yaml up --detach --no-build
                '''
            }
        }

        stage('Health Check') {
            steps {
                echo 'Checking application health...'

                powershell '''
                    $ErrorActionPreference = "Stop"
                    $healthy = $false

                    for ($i = 1; $i -le 12; $i++) {
                        try {
                            $response = Invoke-RestMethod `
                                -Uri "http://localhost:5001/health" `
                                -TimeoutSec 5

                            if ($response.status -eq "healthy") {
                                Write-Host "Health check passed."
                                $response | ConvertTo-Json
                                $healthy = $true
                                break
                            }
                        }
                        catch {
                            Write-Host "Health check attempt $i failed."
                            Write-Host $_.Exception.Message
                        }

                        if (-not $healthy) {
                            Start-Sleep -Seconds 5
                        }
                    }

                    if (-not $healthy) {
                        throw "Application health check failed after retries."
                    }
                '''
            }
        }

        stage('Verify Inventory API') {
            steps {
                echo 'Verifying the inventory products API...'

                powershell '''
                    $ErrorActionPreference = "Stop"

                    $response = Invoke-RestMethod `
                        -Uri "http://localhost:5001/api/products" `
                        -TimeoutSec 10

                    Write-Host "Inventory API responded successfully."

                    $response | ConvertTo-Json -Depth 5
                '''
            }
        }
    }

    post {
        success {
            echo 'SUCCESS: Tests passed, Docker image built, deployment completed, and API checks passed.'
        }

        failure {
            echo 'FAILED: Check Console Output for the failing stage.'
        }

        always {
            echo 'Smart Inventory CI/CD pipeline finished.'
        }
    }
}
