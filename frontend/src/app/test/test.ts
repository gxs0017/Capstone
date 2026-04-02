import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-test',
  standalone: true,
  imports: [],
  templateUrl: './test.html',
  styleUrls: ['./test.css']
})
export class TestComponent {

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get('http://localhost:5000/api/auth/all-users')
      .subscribe({
        next: (res) => {
          console.log('Protected data:', res);
        },
        error: (err) => {
          console.error('Error:', err);
        }
      });
  }

}
