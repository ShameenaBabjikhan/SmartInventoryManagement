
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        PYTHON_EXE = 'C:\\Users\\Shameena\\AppData\\Local\\Programs\\Python\\Python313\\python.exe'
        DOCKER_EXE = 'C:\\Users\\Shameena\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe'
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
                echo 'Running application tests...'
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
                echo 'Tagging the tested image for the existing Compose service...'
                bat '"%DOCKER_EXE%" tag smart-inventory-app:%BUILD_NUMBER% %COMPOSE_IMAGE%'
            }
        }

        stage('Deploy Application') {
            steps {
                echo 'Deploying the tested image with the existing Compose configuration...'

                // Use the existing Compose project and named database volume.
                // Do not use "down -v".
                bat '''
                    cd /d "%PROJECT_DIR%" && "%DOCKER_EXE%" compose up -d --no-build
                '''
            }
        }

        stage('Health Check') {
            steps {
                echo 'Waiting for the deployed application to become healthy...'

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
                            Write-Host "Attempt $i failed. Retrying..."
                        }

                        Start-Sleep -Seconds 5
                    }

                    if (-not $healthy) {
                        throw "Deployment health check failed."
                    }
                '''
            }
        }

        stage('Verify Inventory API') {
            steps {
                echo 'Checking that the inventory API responds...'

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
